from rest_framework import generics, permissions
from rest_framework.response import Response
from django.contrib.auth.models import User
from .serializers import UserSerializer, RegisterSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.views import APIView
from rest_framework import status

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = RegisterSerializer

class UserProfileView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user

class LogoutView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        try:
            # We don't really have to blacklist tokens unless we want to, 
            # client side deletion of token is usually enough for simple setups.
            return Response(status=status.HTTP_205_RESET_CONTENT)
        except Exception as e:
            return Response(status=status.HTTP_400_BAD_REQUEST)
