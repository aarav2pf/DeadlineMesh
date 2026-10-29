import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  normalizeName,
  validateEmail,
  validateFullName,
  validateSignupPassword,
} from "../lib/formValidation";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const cleanName = normalizeName(name);
    const cleanEmail = email.trim().toLowerCase();

    const nextNameError = validateFullName(cleanName) ?? "";
    const nextEmailError = validateEmail(cleanEmail) ?? "";
    const nextPasswordError = validateSignupPassword(password) ?? "";

    const nextConfirmPasswordError =
      confirmPassword.length === 0
        ? "Please confirm your password."
        : confirmPassword !== password
          ? "Passwords do not match."
          : "";

    setNameError(nextNameError);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setConfirmPasswordError(nextConfirmPasswordError);

    if (
      nextNameError ||
      nextEmailError ||
      nextPasswordError ||
      nextConfirmPasswordError
    ) {
      if (nextNameError) nameInputRef.current?.focus();
      else if (nextEmailError) emailInputRef.current?.focus();
      else if (nextPasswordError) passwordInputRef.current?.focus();
      else confirmPasswordInputRef.current?.focus();

      return;
    }

    setSubmitting(true);

    try {
      await signup(cleanName, cleanEmail, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page" id="main-content" tabIndex={-1}>
      <section className="auth-window">
        <header className="window-titlebar">
          <span>DeadlineMesh.exe — Create Account</span>
          <span className="window-controls" aria-hidden="true">
            − □ ×
          </span>
        </header>

        <div className="auth-content">
          <p className="eyebrow">DEADLINEMESH / NEW USER</p>
          <h1>Create your workspace.</h1>
          <p className="muted">
            One account. Every deadline under control.
          </p>

          <form
            onSubmit={handleSubmit}
            className="auth-form"
            noValidate
          >
            <label>
              Full name
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(event) => {
                  const value = event.target.value;
                  setName(value);
                  setError("");

                  if (nameError) {
                    setNameError(validateFullName(value) ?? "");
                  }
                }}
                onBlur={() =>
                  setNameError(validateFullName(name) ?? "")
                }
                autoComplete="name"
                minLength={2}
                maxLength={100}
                aria-invalid={Boolean(nameError)}
                aria-describedby={
                  nameError ? "signup-name-error" : undefined
                }
                required
              />
              {nameError && (
                <span
                  id="signup-name-error"
                  className="form-error"
                >
                  {nameError}
                </span>
              )}
            </label>

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

                  if (emailError) {
                    setEmailError(validateEmail(value) ?? "");
                  }
                }}
                onBlur={() =>
                  setEmailError(validateEmail(email) ?? "")
                }
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(emailError)}
                aria-describedby={
                  emailError ? "signup-email-error" : undefined
                }
                required
              />
              {emailError && (
                <span
                  id="signup-email-error"
                  className="form-error"
                >
                  {emailError}
                </span>
              )}
            </label>

            <label>
              Password
              <input
                ref={passwordInputRef}
                type="password"
                value={password}
                onChange={(event) => {
                  const value = event.target.value;
                  setPassword(value);
                  setError("");

                  if (passwordError) {
                    setPasswordError(
                      validateSignupPassword(value) ?? ""
                    );
                  }

                  if (confirmPassword) {
                    setConfirmPasswordError(
                      value === confirmPassword
                        ? ""
                        : "Passwords do not match."
                    );
                  }
                }}
                onBlur={() =>
                  setPasswordError(
                    validateSignupPassword(password) ?? ""
                  )
                }
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={
                  passwordError
                    ? "signup-password-error"
                    : undefined
                }
                required
              />
              {passwordError && (
                <span
                  id="signup-password-error"
                  className="form-error"
                >
                  {passwordError}
                </span>
              )}
            </label>

            <label>
              Confirm password
              <input
                ref={confirmPasswordInputRef}
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  const value = event.target.value;
                  setConfirmPassword(value);
                  setError("");

                  if (confirmPasswordError) {
                    setConfirmPasswordError(
                      value.length === 0
                        ? "Please confirm your password."
                        : value !== password
                          ? "Passwords do not match."
                          : ""
                    );
                  }
                }}
                onBlur={() =>
                  setConfirmPasswordError(
                    confirmPassword.length === 0
                      ? "Please confirm your password."
                      : confirmPassword !== password
                        ? "Passwords do not match."
                        : ""
                  )
                }
                autoComplete="new-password"
                aria-invalid={Boolean(confirmPasswordError)}
                aria-describedby={
                  confirmPasswordError
                    ? "signup-confirm-password-error"
                    : undefined
                }
                required
              />
              {confirmPasswordError && (
                <span
                  id="signup-confirm-password-error"
                  className="form-error"
                >
                  {confirmPasswordError}
                </span>
              )}
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={submitting}>
              {submitting
                ? "Creating account..."
                : "Create account →"}
            </button>
          </form>

          <p className="auth-footer">
            Already registered? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}