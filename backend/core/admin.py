from django.contrib import admin
from .models import Batch, Student, Payment, Attendance, Test, Mark
for m in (Batch, Student, Payment, Attendance, Test, Mark):
    admin.site.register(m)
