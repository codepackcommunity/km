"use client"
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase/config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardDescription,
  CardContent,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Role determination functions
const isAdminEmail = (email) => {
  const adminEmails = [
    'superadmin@kmelectronics.com',
    'admin@kmelectronics.com', 
    'manager@kmelectronics.com'
  ];
  return adminEmails.includes(email.toLowerCase());
};

const getUserRole = (email) => {
  const emailLower = email.toLowerCase();
  
  if (emailLower === 'superadmin@kmelectronics.com') {
    return 'superadmin';
  } else if (emailLower === 'admin@kmelectronics.com') {
    return 'admin';
  } else if (emailLower === 'manager@kmelectronics.com') {
    return 'manager';
  } else {
    return 'user';
  }
};

export default function SignUp() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const router = useRouter();

  const {
    control,
    handleSubmit,
    formState: { errors },
    setError,
    reset,
    watch
  } = useForm({
    defaultValues: {
      email: "",
      password: "",
      fullName: ""
    }
  });

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setSignupSuccess(false);
    reset();
    setError("root", { message: "" });
  };

  const redirectBasedOnRole = (role) => {
    switch (role) {
      case "superadmin":
        router.push("/admin/superadmin/dashboard");
        break;
      case "admin":
        router.push("/admin/admin/dashboard");
        break;
      case "manager":
        router.push("/admin/admin/manager/dashboard");
        break;
      default:
        router.push("dashboard");
    }
  };

  const checkUserApprovalStatus = async (email) => {
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", email));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        
        console.log("User data found:", userData);
        
        // Check approval status - using status field
        if (userData.status === "pending") {
          return { approved: false, userData };
        } else if (userData.status === "approved" || userData.status === "active") {
          return { approved: true, userData };
        }
        
        // Fallback: check if user has admin privileges (auto-approved)
        if (userData.role === "superadmin" || userData.role === "admin" || userData.role === "manager") {
          return { approved: true, userData };
        }
        
        // If no status field exists, assume pending
        return { approved: false, userData };
      }
      return { approved: false, userData: null };
    } catch (error) {
      console.error("Error checking user approval status:", error);
      return { approved: false, userData: null };
    }
  };

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError("root", { message: "" });
    
    try {
      if (isLogin) {
        // Login logic
        console.log("Login attempt for:", data.email);
        const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
        const user = userCredential.user;
        
        console.log("Firebase auth successful, checking approval status...");
        
        // Check user approval status
        const { approved, userData } = await checkUserApprovalStatus(data.email);
        
        console.log("Approval status:", approved, "User data:", userData);
        
        if (!approved) {
          setError("root", { 
            message: "Your account is pending admin approval. Please wait for approval to access the system." 
          });
          await auth.signOut();
          setIsLoading(false);
          return;
        }

        // Update last login timestamp
        if (userData && userData.uid) {
          await setDoc(doc(db, "users", userData.uid), {
            lastLogin: serverTimestamp()
          }, { merge: true });
        }

        // Redirect based on user role
        const userRole = userData?.role || "user";
        console.log("Redirecting user with role:", userRole);
        redirectBasedOnRole(userRole);

      } else {
        // Signup logic
        console.log("Signup attempt for:", data.email);
        const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
        const user = userCredential.user;

        console.log("Firebase user created:", user.uid);

        // Check if the signing up user has special role
        const isAdmin = isAdminEmail(data.email);
        const userRole = getUserRole(data.email);

        console.log("User role determined:", userRole, "Is admin:", isAdmin);

        // Auto-approve admins, superadmins, and managers
        const autoApprove = isAdmin || userRole === "superadmin" || userRole === "admin" || userRole === "manager";
        const userStatus = autoApprove ? "approved" : "pending";

        console.log("Auto-approve:", autoApprove, "Status:", userStatus);

        // Store user data in Firestore - using consistent field names
        const userData = {
          uid: user.uid,
          email: data.email,
          fullName: data.fullName,
          role: userRole,
          status: userStatus, // Use status field consistently
          isAdmin: isAdmin,
          createdAt: serverTimestamp(),
          lastLogin: autoApprove ? serverTimestamp() : null,
          location: "" // Default empty location
        };

        await setDoc(doc(db, "users", user.uid), userData);
        console.log("User data stored in Firestore");

        // If user is not auto-approved, create an approval request
        if (!autoApprove) {
          await addDoc(collection(db, "userApprovalHistory"), {
            userId: user.uid,
            userEmail: data.email,
            userName: data.fullName,
            action: "signup_request",
            requestedAt: serverTimestamp(),
            status: "pending",
            role: userRole,
            location: ""
          });
          console.log("Approval request created");
        }

        // Sign out the user immediately after signup (unless they're auto-approved)
        if (!autoApprove) {
          await auth.signOut();
          setSignupSuccess(true);
          reset();
          console.log("User signed out, showing success message");
        } else {
          // If auto-approved, log them in directly and redirect to appropriate dashboard
          console.log(`${userRole} user created and logged in successfully`);
          redirectBasedOnRole(userRole);
        }
      }
    } catch (error) {
      console.error("Authentication error:", error);
      let errorMessage = "Something went wrong. Please try again.";
      
      switch (error.code) {
        case "auth/invalid-credential":
          errorMessage = "Incorrect email and password combination.";
          break;
        case "auth/email-already-in-use":
          errorMessage = "This email is already registered. Please login instead.";
          break;
        case "auth/invalid-email":
          errorMessage = "Please enter a valid email address.";
          break;
        case "auth/weak-password":
          errorMessage = "Password should be at least 6 characters.";
          break;
        case "auth/user-not-found":
          errorMessage = "No account found with this email.";
          break;
        case "auth/wrong-password":
          errorMessage = "Incorrect password. Please try again.";
          break;
        case "auth/too-many-requests":
          errorMessage = "Too many attempts. Please try again later.";
          break;
        default:
          errorMessage = error.message || "Authentication failed.";
      }
      
      setError("root", { message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  // Success message after signup
  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/10 backdrop-blur-lg border-white/20 shadow-2xl">
          <CardHeader className="space-y-4 pb-6">
            <div className="text-center">
              <CardTitle className="text-3xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
                  KM ELECTRONICS
                </span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white">Registration Successful!</h3>
            <p className="text-white/70">
              Your account has been created and is pending admin approval. 
              You will receive an email notification once your account is approved.
            </p>
            <p className="text-pink-300 text-sm">
              Please check your email for updates regarding your account status.
            </p>
          </CardContent>
          <CardFooter className="flex justify-center pt-4 border-t border-white/10">
            <Button
              onClick={toggleMode}
              className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white"
            >
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/10 backdrop-blur-lg border-white/20 shadow-2xl">
        <CardHeader className="space-y-4 pb-6">
          <div className="text-center">
            <CardTitle className="text-3xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
                KM ELECTRONICS
              </span>
            </CardTitle>
            <CardDescription className="text-white/70 mt-2 text-sm">
              {isLogin ? "Welcome back! Please sign in to your account" : "Create your account (Admin approval required)"}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Controller
                  name="fullName"
                  control={control}
                  rules={{
                    required: !isLogin ? "Full name is required" : false,
                    minLength: {
                      value: 2,
                      message: "Full name must be at least 2 characters"
                    }
                  }}
                  render={({ field }) => (
                    <div className="space-y-1">
                      <Input
                        {...field}
                        type="text"
                        placeholder="Enter your full name"
                        className="bg-white/5 border-white/20 text-white placeholder:text-white/50 h-12 transition-all duration-200 focus:bg-white/10 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
                        disabled={isLoading}
                      />
                      {errors.fullName && (
                        <p className="text-pink-300 text-xs font-medium px-1">
                          {errors.fullName.message}
                        </p>
                      )}
                    </div>
                  )}
                />
              </div>
            )}

            <div className="space-y-2">
              <Controller
                name="email"
                control={control}
                rules={{
                  required: "Email is required",
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: "Invalid email address"
                  }
                }}
                render={({ field }) => (
                  <div className="space-y-1">
                    <Input
                      {...field}
                      type="email"
                      placeholder="Enter your email"
                      className="bg-white/5 border-white/20 text-white placeholder:text-white/50 h-12 transition-all duration-200 focus:bg-white/10 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
                      disabled={isLoading}
                    />
                    {errors.email && (
                      <p className="text-pink-300 text-xs font-medium px-1">
                        {errors.email.message}
                      </p>
                    )}
                  </div>
                )}
              />
            </div>

            <div className="space-y-2">
              <Controller
                name="password"
                control={control}
                rules={{
                  required: "Password is required",
                  minLength: {
                    value: 6,
                    message: "Password must be at least 6 characters"
                  }
                }}
                render={({ field }) => (
                  <div className="space-y-1">
                    <div className="relative">
                      <Input
                        {...field}
                        type={showPassword ? "text" : "password"}
                        placeholder={isLogin ? "Enter your password" : "Create a password"}
                        className="bg-white/5 border-white/20 text-white placeholder:text-white/50 h-12 pr-10 transition-all duration-200 focus:bg-white/10 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/70 transition-colors duration-200"
                        disabled={isLoading}
                      >
                        {showPassword ? (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-pink-300 text-xs font-medium px-1">
                        {errors.password.message}
                      </p>
                    )}
                  </div>
                )}
              />
            </div>

            {!isLogin && (
              <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-3">
                <p className="text-blue-200 text-sm text-center">
                  📧 Your account will require admin approval before you can access the system.
                  <br />
                  <span className="text-xs opacity-80">
                    Admin users (superadmin@kmelectronics.com, admin@kmelectronics.com, manager@kmelectronics.com) are auto-approved.
                  </span>
                </p>
              </div>
            )}

            {errors.root && (
              <div className="bg-pink-500/20 border border-pink-500/50 rounded-lg p-3">
                <p className="text-pink-200 text-sm text-center">
                  {errors.root.message}
                </p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-semibold transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] border-0 shadow-lg shadow-pink-500/25"
            >
              {isLoading ? (
                <>
                  <svg className="h-4 w-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isLogin ? "Signing In..." : "Creating Account..."}
                </>
              ) : (
                isLogin ? "Sign In" : "Request Account"
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex justify-center pt-4 border-t border-white/10">
          <p className="text-white/60 text-sm">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="text-pink-300 hover:text-pink-200 font-medium transition-colors duration-200 underline-offset-2 hover:underline"
              onClick={toggleMode}
              disabled={isLoading}
            >
              {isLogin ? "Request Access" : "Sign In"}
            </button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}