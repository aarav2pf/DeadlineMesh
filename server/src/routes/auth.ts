import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import validator from "validator";
import { pool } from "../db/pool";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import rateLimit from "express-rate-limit";

const router = Router();

// Keep authentication endpoints from being abused by repeated requests.
// Separate limits prevent signup attempts from consuming the login allowance.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
});

const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many signup attempts. Please try again in an hour.",
  },
});

function createToken(user: { id: number; email: string }) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    { sub: String(user.id), email: user.email },
    secret,
    { expiresIn: "1d" }
  );
}

router.post("/signup", signupRateLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Name, email, and password are required.",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 100) {
      return res.status(400).json({
        message: "Name must be between 2 and 100 characters.",
      });
    }

    if (!validator.isEmail(cleanEmail)) {
      return res.status(400).json({
        message: "Enter a valid email address.",
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        message: "Password must be between 8 and 72 characters.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO app_users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [cleanName, cleanEmail, passwordHash]
    );

    const user = result.rows[0];
    const token = createToken(user);

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user,
    });
  } catch (error: unknown) {
    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    console.error("Signup failed:", error);

    return res.status(500).json({
      message: "Could not create account.",
    });
  }
});

router.post("/login", loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !validator.isEmail(email.trim())
    ) {
      return res.status(400).json({
        message: "Enter a valid email and password.",
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, password_hash
       FROM app_users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const token = createToken(user);

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);

    return res.status(500).json({
      message: "Could not log in.",
    });
  }
});


router.get("/me", requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthRequest;

    const result = await pool.query(
      `SELECT id, name, email, created_at
       FROM app_users
       WHERE id = $1`,
      [authReq.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "User account no longer exists.",
      });
    }

    return res.status(200).json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Current-user lookup failed:", error);

    return res.status(500).json({
      message: "Could not retrieve user.",
    });
  }
});


export default router;
