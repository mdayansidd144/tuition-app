import re
from datetime import date
from rest_framework import serializers
from .models import Batch, Student, Payment, Test

PHONE_RE = re.compile(r"^[6-9]\d{9}$")
NAME_RE = re.compile(r"^[A-Za-z\u0900-\u097F\u0600-\u06FF][A-Za-z\u0900-\u097F\u0600-\u06FF .'\-]{1,99}$")
V = serializers.ValidationError


def clean_name(v, label="Name"):
    v = " ".join((v or "").split())
    if not NAME_RE.match(v):
        raise V(f"{label} must have at least 2 letters and no digits or symbols")
    return v


def clean_phone(v, required=False):
    v = re.sub(r"[\s\-+]", "", v or "")
    if len(v) == 12 and v.startswith("91"):
        v = v[2:]
    elif len(v) == 11 and v.startswith("0"):
        v = v[1:]
    if not v:
        if required:
            raise V("Phone number is required")
        return ""
    if not PHONE_RE.match(v):
        raise V("Enter a valid 10-digit mobile number (starts with 6-9)")
    return v


def not_future(v, label="Date"):
    if v > date.today():
        raise V(f"{label} cannot be in the future")
    return v


class BatchSerializer(serializers.ModelSerializer):
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = Batch
        fields = "__all__"

    def get_student_count(self, o):
        return o.students.filter(active=True).count()

    def validate_name(self, v):
        v = " ".join(v.split())
        if len(v) < 2:
            raise V("Batch name must have at least 2 characters")
        qs = Batch.objects.filter(name__iexact=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise V("A batch with this name already exists")
        return v

    def validate_monthly_fee(self, v):
        if v <= 0 or v > 100000:
            raise V("Monthly fee must be between 1 and 1,00,000")
        return v

    def validate_subject(self, v):
        return " ".join(v.split())

    def validate_timing(self, v):
        return " ".join(v.split())


class StudentSerializer(serializers.ModelSerializer):
    batch_names = serializers.SerializerMethodField()
    total_fee = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    paid = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    due = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Student
        fields = "__all__"
        extra_kwargs = {
            "parent_name": {"required": True, "allow_blank": False},
            "parent_phone": {"required": True, "allow_blank": False},
            "batches": {"required": True},
        }

    def get_batch_names(self, o):
        return [b.name for b in o.batches.all()]

    def validate_name(self, v): return clean_name(v, "Student name")
    def validate_parent_name(self, v): return clean_name(v, "Parent name")
    def validate_phone(self, v): return clean_phone(v)
    def validate_parent_phone(self, v): return clean_phone(v, True)
    def validate_address(self, v): return " ".join(v.split())
    def validate_joined_on(self, v): return not_future(v, "Joining date")

    def validate_batches(self, v):
        if not v:
            raise V("Select at least one batch")
        return v

    def validate(self, a):
        if "name" in a and "parent_phone" in a:
            qs = Student.objects.filter(name__iexact=a["name"], parent_phone=a["parent_phone"])
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise V("This student is already registered")
        return a


class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.name", read_only=True)
    parent_phone = serializers.CharField(source="student.parent_phone", read_only=True)

    class Meta:
        model = Payment
        fields = "__all__"

    def validate_amount(self, v):
        if v <= 0 or v > 1000000:
            raise V("Amount must be between 1 and 10,00,000")
        return v

    def validate_paid_on(self, v): return not_future(v, "Payment date")
    def validate_for_month(self, v): return " ".join(v.split())
    def validate_note(self, v): return " ".join(v.split())

    def validate(self, a):
        if not self.instance:
            s = a["student"]
            if not s.active:
                raise V("This student is inactive")
            due = s.due()
            if due <= 0:
                raise V("No pending fees for this student")
            if a["amount"] > due:
                raise V(f"Amount is more than the pending fee of Rs. {due:,.2f}")
        return a


class TestSerializer(serializers.ModelSerializer):
    batch_name = serializers.CharField(source="batch.name", read_only=True)

    class Meta:
        model = Test
        fields = "__all__"

    def validate_name(self, v):
        v = " ".join(v.split())
        if len(v) < 2:
            raise V("Test name must have at least 2 characters")
        return v

    def validate_max_marks(self, v):
        if v <= 0 or v > 1000:
            raise V("Max marks must be between 1 and 1000")
        return v

    def validate(self, a):
        if not self.instance:
            if Test.objects.filter(batch=a["batch"], name__iexact=a["name"], date=a["date"]).exists():
                raise V("This test already exists for the batch on this date")
        return a
