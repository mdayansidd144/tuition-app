from datetime import date
from decimal import Decimal
from decimal import InvalidOperation
from django.db import transaction
from django.db.models import Sum
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from .models import Batch, Student, Payment, Attendance, Test, Mark
from .serializers import BatchSerializer, StudentSerializer, PaymentSerializer, TestSerializer
from .receipt import build_receipt


def fmt_num(n):
    """Format a Decimal/number without trailing zeros (10.00 -> '10', 10.50 -> '10.5')."""
    return f"{Decimal(str(n)).normalize():f}".rstrip("0").rstrip(".") if n is not None else ""


class LoginView(ObtainAuthToken):
    authentication_classes = []
    permission_classes = []

    def post(self, request, *a, **kw):
        s = self.serializer_class(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        token, _ = Token.objects.get_or_create(user=s.validated_data["user"])
        return Response({"token": token.key})


class BatchViewSet(viewsets.ModelViewSet):
    queryset = Batch.objects.all().order_by("name")
    serializer_class = BatchSerializer


class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer

    def get_queryset(self):
        qs = Student.objects.all().order_by("name").prefetch_related("batches", "payments")
        b = self.request.query_params.get("batch")
        return qs.filter(batches__id=b) if b else qs

    @action(detail=True)
    def report(self, request, pk=None):
        s = self.get_object()
        att = Attendance.objects.filter(student=s)
        total, present = att.count(), att.filter(present=True).count()
        marks = [
            {"test": m.test.name, "batch": m.test.batch.name, "date": m.test.date,
             "marks": m.marks, "max": m.test.max_marks,
             "percent": round(float(m.marks) / float(m.test.max_marks) * 100, 1) if m.test.max_marks else 0}
            for m in s.marks.select_related("test__batch").order_by("-test__date")
        ]
        return Response({
            "student": StudentSerializer(s).data,
            "attendance": {"present": present, "total": total,
                           "percent": round(present / total * 100, 1) if total else None},
            "marks": marks,
        })


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer

    def get_queryset(self):
        qs = Payment.objects.select_related("student").order_by("-id")
        sid = self.request.query_params.get("student")
        return qs.filter(student_id=sid) if sid else qs

    @action(detail=True)
    def receipt(self, request, pk=None):
        p = self.get_object()
        resp = HttpResponse(build_receipt(p), content_type="application/pdf")
        resp["Content-Disposition"] = f'inline; filename="{p.receipt_no}.pdf"'
        return resp


class TestViewSet(viewsets.ModelViewSet):
    queryset = Test.objects.select_related("batch").order_by("-date", "-id")
    serializer_class = TestSerializer

    @action(detail=True, methods=["get", "post"])
    def marks(self, request, pk=None):
        t = self.get_object()
        att = {a.student_id: a.present for a in Attendance.objects.filter(batch=t.batch, date=t.date)}
        studs = list(t.batch.students.filter(active=True).order_by("name"))
        existing = {m.student_id: m.marks for m in t.marks.all()}

        def eligible(sid):
            return att.get(sid) is True

        if request.method == "POST":
            if t.date > date.today():
                raise ValidationError({"records": ["Test date is in the future. Enter marks on or after the test date."]})
            by_id, errors, todo = {s.id: s for s in studs}, [], []
            for r in request.data.get("records", []):
                s = by_id.get(r.get("student"))
                if not s:
                    errors.append("Unknown student in this batch")
                    continue
                raw = r.get("marks")
                if raw in (None, ""):
                    todo.append((s.id, None))
                    continue
                try:
                    v = Decimal(str(raw)).quantize(Decimal("0.01"))
                except (InvalidOperation, ValueError):
                    errors.append(f"{s.name}: marks must be a number")
                    continue
                if v < 0 or v > t.max_marks:
                    errors.append(f"{s.name}: marks must be between 0 and {fmt_num(t.max_marks)}")
                elif not eligible(s.id) and existing.get(s.id) != v:
                    why = "was absent" if att.get(s.id) is False else "has no attendance marked"
                    errors.append(f"{s.name} {why} on {t.date}, so marks cannot be entered")
                else:
                    todo.append((s.id, v))
            if errors:
                raise ValidationError({"records": errors})
            with transaction.atomic():
                for sid, v in todo:
                    if v is None:
                        Mark.objects.filter(test=t, student_id=sid).delete()
                    else:
                        Mark.objects.update_or_create(test=t, student_id=sid, defaults={"marks": v})
            existing = {m.student_id: m.marks for m in t.marks.all()}

        def why(sid):
            if eligible(sid): return ""
            return "Absent on test day" if att.get(sid) is False else "Attendance not marked for test day"

        return Response({"date": t.date, "max_marks": t.max_marks, "attendance_marked": bool(att),
                         "rows": [{"student": s.id, "name": s.name, "parent_phone": s.parent_phone,
                                   "marks": existing.get(s.id), "eligible": eligible(s.id), "reason": why(s.id)}
                                  for s in studs]})


@api_view(["GET", "POST"])
def attendance(request):
    src = request.data if request.method == "POST" else request.query_params
    batch = Batch.objects.filter(pk=src.get("batch") or 0).first()
    d = parse_date(str(src.get("date") or ""))
    if not batch:
        raise ValidationError({"batch": ["Select a valid batch"]})
    if not d:
        raise ValidationError({"date": ["Enter a valid date"]})
    if d > date.today():
        raise ValidationError({"date": ["Attendance cannot be marked for a future date"]})
    studs = list(batch.students.filter(active=True).order_by("name"))
    if request.method == "POST":
        ids, recs = {s.id for s in studs}, request.data.get("records", [])
        for r in recs:
            if r.get("student") not in ids:
                raise ValidationError({"records": ["A student in the list does not belong to this batch"]})
            if not isinstance(r.get("present"), bool):
                raise ValidationError({"records": ["Present must be true or false"]})
        with transaction.atomic():
            for r in recs:
                Attendance.objects.update_or_create(student_id=r["student"], batch=batch, date=d,
                                                    defaults={"present": r["present"]})
    marked = {a.student_id: a.present for a in Attendance.objects.filter(batch=batch, date=d)}
    return Response([{"student": s.id, "name": s.name, "parent_name": s.parent_name,
                      "parent_phone": s.parent_phone, "present": marked.get(s.id, True),
                      "marked": s.id in marked} for s in studs])


@api_view(["GET"])
def dashboard(request):
    today = date.today()
    students = list(Student.objects.filter(active=True).prefetch_related("batches", "payments"))
    dues = sorted(((s, s.due()) for s in students), key=lambda x: x[1], reverse=True)
    collected = Payment.objects.filter(paid_on__year=today.year, paid_on__month=today.month) \
        .aggregate(s=Sum("amount"))["s"] or Decimal(0)
    today_att = {}
    for a in Attendance.objects.filter(date=today):
        c = today_att.setdefault(a.batch_id, [0, 0])
        c[0 if a.present else 1] += 1
    return Response({
        "students": len(students),
        "batches": Batch.objects.count(),
        "collected_this_month": collected,
        "total_billed": sum((s.total_fee() for s in students), Decimal(0)),
        "total_paid": sum((s.paid() for s in students), Decimal(0)),
        "total_due": sum((d for _, d in dues if d > 0), Decimal(0)),
        "top_dues": [{"id": s.id, "name": s.name, "parent_phone": s.parent_phone, "due": d}
                     for s, d in dues[:6] if d > 0],
        "batches_today": [{"id": b.id, "name": b.name, "timing": b.timing,
                           "students": b.students.filter(active=True).count(),
                           "marked": b.id in today_att,
                           "present": today_att.get(b.id, [0, 0])[0],
                           "absent": today_att.get(b.id, [0, 0])[1]}
                          for b in Batch.objects.order_by("name")],
        "recent_payments": [{"id": p.id, "student_name": p.student.name, "amount": p.amount,
                             "paid_on": p.paid_on, "receipt_no": p.receipt_no}
                            for p in Payment.objects.select_related("student").order_by("-id")[:5]],
    })