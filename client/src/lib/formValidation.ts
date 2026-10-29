/** Shared client-side validation for the Login and Signup forms. */

export function validateEmail(input: string): string | null {
  const email = input.trim();

  if (!email) {
    return "Email address is required.";
  }

  if (email.length > 254) {
    return "Email address must be 254 characters or fewer.";
  }

  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex !== email.indexOf("@")) {
    return "Enter a valid email address, such as name@example.com.";
  }

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(localPart)
  ) {
    return "Enter a valid email address, such as name@example.com.";
  }

  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/i.test(label)
    )
  ) {
    return "Enter a valid email address, such as name@example.com.";
  }

  const topLevelDomain = labels[labels.length - 1];
  if (!/^(?:[A-Z]{2,63}|xn--[A-Z0-9-]{2,59})$/i.test(topLevelDomain)) {
    return "The email domain must end with a valid domain extension.";
  }

  return null;
}

export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function validateFullName(input: string): string | null {
  const name = normalizeName(input);

  if (!name) {
    return "Full name is required.";
  }

  if (name.length < 2) {
    return "Enter your full name using at least 2 characters.";
  }

  if (name.length > 100) {
    return "Full name must be 100 characters or fewer.";
  }

  // Permit international names, including accents, spaces, apostrophes,
  // periods and hyphens, while rejecting numbers and arbitrary symbols.
  if (!/^[\p{L}\p{M} .'-]+$/u.test(name)) {
    return "Use letters only, with spaces, apostrophes, periods or hyphens where needed.";
  }

  const letters = name.match(/\p{L}/gu) ?? [];
  if (letters.length < 2) {
    return "Enter a name containing at least 2 letters.";
  }

  if (!/^[\p{L}\p{M}]/u.test(name) || !/[\p{L}\p{M}]$/u.test(name)) {
    return "Your name must start and end with a letter.";
  }

  return null;
}

export function validateSignupPassword(input: string): string | null {
  if (!input) {
    return "Password is required.";
  }

  if (input.length < 8) {
    return "Password must be at least 8 characters long.";
  }

  if (input.length > 72) {
    return "Password must be 72 characters or fewer.";
  }

  return null;
}
