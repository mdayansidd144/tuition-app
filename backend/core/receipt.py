from io import BytesIO
from django.conf import settings
from reportlab.lib.pagesizes import A5
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


def build_receipt(p):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A5)
    w, h = A5
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(w / 2, h - 20 * mm, settings.INSTITUTE_NAME)
    if settings.INSTITUTE_PHONE:
        c.setFont("Helvetica", 9)
        c.drawCentredString(w / 2, h - 26 * mm, "Phone: " + settings.INSTITUTE_PHONE)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(w / 2, h - 36 * mm, "FEE RECEIPT")
    c.line(15 * mm, h - 40 * mm, w - 15 * mm, h - 40 * mm)
    rows = [
        ("Receipt No", p.receipt_no),
        ("Date", p.paid_on.strftime("%d %b %Y")),
        ("Student", p.student.name),
        ("Parent", p.student.parent_name or "-"),
        ("Batches", ", ".join(b.name for b in p.student.batches.all()) or "-"),
        ("For", p.for_month or "-"),
        ("Mode", p.get_mode_display()),
        ("Amount Paid", f"Rs. {p.amount:,.2f}"),
        ("Balance Due", f"Rs. {p.student.due():,.2f}"),
    ]
    y = h - 52 * mm
    for k, v in rows:
        c.setFont("Helvetica", 10)
        c.drawString(20 * mm, y, k)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(55 * mm, y, str(v))
        y -= 8 * mm
    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(w / 2, 15 * mm, "Computer generated receipt. Thank you!")
    c.showPage()
    c.save()
    return buf.getvalue()
