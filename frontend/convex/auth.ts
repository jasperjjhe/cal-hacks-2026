import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Anonymous,
    Password({
      validatePasswordRequirements(password) {
        if (password.length < 8 || password.length > 256)
          throw new Error("Password must be between 8 and 256 characters.");
      },
      profile(params) {
        if (typeof params.email !== "string")
          throw new Error("Email is required.");
        const email = params.email.trim().toLowerCase();
        if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
          throw new Error("A valid email is required.");
        return { email };
      },
    }),
  ],
});
