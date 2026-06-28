const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { sql, poolPromise } = require("../db");

router.post("/register", async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        const conn = await poolPromise;

        const existingUser = await conn.request()
            .input("Email", sql.NVarChar, email)
            .query(`
                SELECT UserId
                FROM Users
                WHERE Email = @Email
            `);

        if (existingUser.recordset.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Email already exists."
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        await conn.request()
            .input("FullName", sql.NVarChar, fullName)
            .input("Email", sql.NVarChar, email)
            .input("PasswordHash", sql.NVarChar, passwordHash)
            .query(`
                INSERT INTO Users
                (FullName, Email, PasswordHash)
                VALUES
                (@FullName, @Email, @PasswordHash)
            `);

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const conn = await poolPromise;

        const result = await conn.request()
            .input("Email", sql.NVarChar, email)
            .query(`
                SELECT UserId, FullName, Email, PasswordHash
                FROM Users
                WHERE Email = @Email
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const user = result.recordset[0];

        const isMatch = await bcrypt.compare(
            password,
            user.PasswordHash
        );

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const token = jwt.sign(
            {
                userId: user.UserId,
                email: user.Email
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN
            }
        );

        res.json({
            success: true,
            token,
            user: {
                userId: user.UserId,
                fullName: user.FullName,
                email: user.Email
            }
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;