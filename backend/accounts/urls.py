from django.urls import path

from .views import (
    ChangePasswordView,
    LogoutView,
    RegisterView,
    ThrottledLoginView,
    ThrottledRefreshView,
    UserProfileView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", ThrottledLoginView.as_view(), name="login"),
    path("token/refresh/", ThrottledRefreshView.as_view(), name="token_refresh"),
    path("profile/", UserProfileView.as_view(), name="profile"),
    path("password/", ChangePasswordView.as_view(), name="change-password"),
    path("logout/", LogoutView.as_view(), name="logout"),
]
