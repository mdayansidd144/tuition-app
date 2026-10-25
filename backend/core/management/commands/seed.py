from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from core.models import Batch, Student


class Command(BaseCommand):
    help = "Create teacher login (teacher / teacher123) and a little demo data"

    def handle(self, *a, **kw):
        if not User.objects.filter(username="teacher").exists():
            User.objects.create_superuser("teacher", "", "teacher123")
        if not Batch.objects.exists():
            b1 = Batch.objects.create(name="Class 10 Maths", subject="Maths", timing="5-6 PM", monthly_fee=800)
            b2 = Batch.objects.create(name="Class 12 Physics", subject="Physics", timing="6-7 PM", monthly_fee=1000)
            for n, pn, ph, b in [("Aman Verma", "Rakesh Verma", "9876543210", b1),
                                 ("Sana Khan", "Imran Khan", "9876501234", b1),
                                 ("Rohit Singh", "Ajay Singh", "9811122233", b2)]:
                Student.objects.create(name=n, parent_name=pn, parent_phone=ph).batches.add(b)
        self.stdout.write("Seeded. Login: teacher / teacher123")
