from datetime import date
from decimal import Decimal
from django.db import models
from django.db.models import Sum


class Batch(models.Model):
    name = models.CharField(max_length=100)
    subject = models.CharField(max_length=100, blank=True)
    timing = models.CharField(max_length=100, blank=True)
    monthly_fee = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    def __str__(self):
        return self.name


class Student(models.Model):
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15, blank=True)
    parent_name = models.CharField(max_length=100, blank=True)
    parent_phone = models.CharField(max_length=15, blank=True)
    address = models.CharField(max_length=255, blank=True)
    joined_on = models.DateField(default=date.today)
    active = models.BooleanField(default=True)
    batches = models.ManyToManyField(Batch, blank=True, related_name="students")

    def __str__(self):
        return self.name

    # Fee rule: every enrolled batch is charged its monthly_fee for each month
    # from joined_on up to the current month (inclusive).
    def months_enrolled(self):
        t, j = date.today(), self.joined_on
        return max(1, (t.year - j.year) * 12 + (t.month - j.month) + 1)

    def total_fee(self):
        monthly = sum((b.monthly_fee for b in self.batches.all()), Decimal(0))
        return monthly * self.months_enrolled()

    def paid(self):
        return self.payments.aggregate(s=Sum("amount"))["s"] or Decimal(0)

    def due(self):
        return self.total_fee() - self.paid()


class Payment(models.Model):
    MODES = [("cash", "Cash"), ("upi", "UPI"), ("bank", "Bank transfer")]
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=9, decimal_places=2)
    paid_on = models.DateField(default=date.today)
    mode = models.CharField(max_length=10, choices=MODES, default="cash")
    for_month = models.CharField(max_length=30, blank=True)
    note = models.CharField(max_length=200, blank=True)
    receipt_no = models.CharField(max_length=20, unique=True, null=True, blank=True, editable=False)

    def save(self, *a, **kw):
        super().save(*a, **kw)
        if not self.receipt_no:  # sequential, derived from the primary key
            self.receipt_no = f"RCPT-{self.pk:05d}"
            Payment.objects.filter(pk=self.pk).update(receipt_no=self.receipt_no)


class Attendance(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE)
    date = models.DateField()
    present = models.BooleanField(default=True)

    class Meta:
        unique_together = ("student", "batch", "date")


class Test(models.Model):
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name="tests")
    name = models.CharField(max_length=100)
    date = models.DateField(default=date.today)
    max_marks = models.DecimalField(max_digits=6, decimal_places=2, default=100)


class Mark(models.Model):
    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name="marks")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="marks")
    marks = models.DecimalField(max_digits=6, decimal_places=2)

    class Meta:
        unique_together = ("test", "student")
