from django.contrib.auth.models import User
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .serializers import ChangePasswordSerializer, RegisterSerializer, UserSerializer


class ThrottledLoginView(TokenObtainPairView):
    """Brute-force protection: tight per-IP rate on credential checks."""

    throttle_scope = "auth"


class ThrottledRefreshView(TokenRefreshView):
    throttle_scope = "auth"


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = RegisterSerializer
    throttle_scope = "auth"


class UserProfileView(generics.RetrieveUpdateAPIView):
    """GET / PATCH /api/accounts/profile/ (email is the only editable field)."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """POST /api/accounts/password/ — change password; all refresh tokens are revoked."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth"

    def post(self, request):
        ser = ChangePasswordSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        request.user.set_password(ser.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        _blacklist_all(request.user)
        return Response({"detail": "Password updated. Please sign in again."}, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    POST /api/accounts/logout/  Body: {"refresh": "<refresh token>"}

    Blacklists the refresh token so it can no longer mint access tokens.
    Pass ``{"all": true}`` to sign out every session.
    """

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        if request.data.get("all") is True:
            _blacklist_all(request.user)
            return Response(status=status.HTTP_205_RESET_CONTENT)

        refresh = request.data.get("refresh")
        if not refresh:
            return Response({"detail": "Refresh token is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh)
            if str(token.get("user_id")) != str(request.user.id):
                return Response({"detail": "Token does not belong to this user."}, status=status.HTTP_400_BAD_REQUEST)
            token.blacklist()
        except TokenError:
            # Already expired/blacklisted — the client is logged out either way.
            pass
        return Response(status=status.HTTP_205_RESET_CONTENT)


def _blacklist_all(user):
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    for tok in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=tok)
