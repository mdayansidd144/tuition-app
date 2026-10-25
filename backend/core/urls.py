from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

r = DefaultRouter()
r.register("batches", views.BatchViewSet, basename="batch")
r.register("students", views.StudentViewSet, basename="student")
r.register("payments", views.PaymentViewSet, basename="payment")
r.register("tests", views.TestViewSet, basename="test")

urlpatterns = [
    path("login/", views.LoginView.as_view()),
    path("attendance/", views.attendance),
    path("dashboard/", views.dashboard),
    path("", include(r.urls)),
]
