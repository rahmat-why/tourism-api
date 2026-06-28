const express = require("express");
const router = express.Router();

const { sql, poolPromise } = require("../db");

const auth = require("../middlewares/auth");

const axios = require("axios");

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure destination upload folder exists
const destinationDir = path.join(__dirname, "../uploads/destination");
if (!fs.existsSync(destinationDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
}

// storage config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, destinationDir); // absolute path to uploads/destination folder
    },
    filename: (req, file, cb) => {
        const uniqueName =
            Date.now() + "-" + Math.round(Math.random() * 1e9);

        cb(
            null,
            uniqueName + path.extname(file.originalname)
        );
    }
});

const upload = multer({ storage });

router.post("/", auth, upload.single("thumbnail"), async (req, res) => {
    const pool = await poolPromise;
    let conn;

    try {
        // Debug logging
        console.log("📁 File upload request received");
        console.log("📄 File info:", req.file ? {
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size,
            mimetype: req.file.mimetype
        } : "No file");
        console.log("📋 Body fields:", req.body);

        const {
            name,
            description,
            provinceId,
            provinceName,
            startDate,
            endDate
        } = req.body;

        // 1. Province data
        const { data: locationWeatherRes } = await axios.get(
            `http://localhost:3000/api/provinces/${provinceId}/location-weather`
        );

        if (!locationWeatherRes?.success || !locationWeatherRes?.data) {
            return res.status(400).json({
                success: false,
                message: "Unable to retrieve province information"
            });
        }

        const { location, weather } = locationWeatherRes.data;

        const latitude = location?.latitude ?? null;
        const longitude = location?.longitude ?? null;
        const temperature = weather?.temperature ?? null;
        const weatherCondition = weather?.condition ?? null;

        // 2. Gambar dari folder uploads/destination
        let thumbnailUrl = null;

        if (req.file) {
            thumbnailUrl = `${req.protocol}://${req.get("host")}/uploads/destination/${req.file.filename}`;
        }

        // 3. Insert DB
        conn = await pool.connect();

        await conn.request()
            .input("UserId", sql.UniqueIdentifier, req.user.userId)
            .input("Name", sql.NVarChar, name)
            .input("Description", sql.NVarChar, description)
            .input("ProvinceId", sql.NVarChar, provinceId)
            .input("ProvinceName", sql.NVarChar, provinceName)
            .input("Latitude", sql.Decimal(10, 8), latitude)
            .input("Longitude", sql.Decimal(11, 8), longitude)
            .input("WeatherCondition", sql.NVarChar, weatherCondition)
            .input("Temperature", sql.Decimal(5, 2), temperature)
            .input("ThumbnailUrl", sql.NVarChar, thumbnailUrl)
            .input("StartDate", sql.DateTime, startDate)
            .input("EndDate", sql.DateTime, endDate)
            .query(`
                INSERT INTO Destination (
                    UserId,
                    Name,
                    Description,
                    ProvinceId,
                    ProvinceName,
                    Latitude,
                    Longitude,
                    WeatherCondition,
                    Temperature,
                    ThumbnailUrl,
                    StartDate,
                    EndDate
                )
                VALUES (
                    @UserId,
                    @Name,
                    @Description,
                    @ProvinceId,
                    @ProvinceName,
                    @Latitude,
                    @Longitude,
                    @WeatherCondition,
                    @Temperature,
                    @ThumbnailUrl,
                    @StartDate,
                    @EndDate
                )
            `);

        return res.json({
            success: true,
            message: "Destination created successfully",
            data: {
                thumbnailUrl
            }
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            success: false,
            message: err.message
        });

    } finally {
        if (conn) conn.close();
    }
});

router.get("/", auth, async (req, res) => {
    const pool = await poolPromise;
    let conn;
    try {
        conn = await pool.connect();

        const result = await conn.request()
            .input("UserId", sql.UniqueIdentifier, req.user.userId)
            .query(`
                SELECT *
                FROM Destination
                WHERE UserId = @UserId
                ORDER BY CreatedAt DESC
            `);

        res.json(result.recordset);

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    } finally {
        if (conn) conn.close();
    }
});

module.exports = router;