import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { validateEmail } from "../lib/formValidation";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();
    const nextEmailError = validateEmail(cleanEmail) ?? "";
    const nextPasswordError = password.length === 0 ? "Password is required." : "";

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError || nextPasswordError) {
      if (nextEmailError) emailInputRef.current?.focus();
      else passwordInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await login(cleanEmail, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page" id="main-content" tabIndex={-1}>
      <section className="auth-window">
        <header className="window-titlebar">
          <span>DeadlineMesh.exe — Login</span>
          <span className="window-controls" aria-hidden="true">− □ ×</span>
        </header>

        <div className="auth-content">
          <p className="eyebrow">DEADLINEMESH / USER ACCESS</p>
          <h1>Welcome back.</h1>
          <p className="muted">Sign in to continue managing your deadlines.</p>

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <label>
              Email address
              <input
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={(event) => {
                  const value = event.target.value;
                  setEmail(value);
                  setError("");
                  if (emailError) setEmailError(validateEmail(value) ?? "");
                }}
                onBlur={() => setEmailError(validateEmail(email) ?? "")}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "login-email-error" : undefined}
                required
              />
              {emailError && <span id="login-email-error" className="form-error">{emailError}</span>}
            </label>

            <label>
              Password
              <input
                ref={passwordInputRef}
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                  if (passwordError && event.target.value.length > 0) setPasswordError("");
                }}
                onBlur={() => setPasswordError(password.length === 0 ? "Password is required." : "")}
                autoComplete="current-password"
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? "login-password-error" : undefined}
                required
              />
              {passwordError && <span id="login-password-error" className="form-error">{passwordError}</span>}
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in →"}
            </button>
          </form>

          <p className="auth-footer">
            New here? <Link to="/signup">Create an account</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
