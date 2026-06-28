const express = require("express");
const router = express.Router();

const sql = require("mssql");
const { poolPromise } = require("../db");
const auth = require("../middlewares/auth");

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure itinerary upload folder exists
const itineraryDir = path.join(__dirname, "../uploads/itinerary");
if (!fs.existsSync(itineraryDir)) {
    fs.mkdirSync(itineraryDir, { recursive: true });
}

// storage config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, itineraryDir);
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

router.post(
    "/:destinationId",
    auth,
    upload.single("captureImage"),
    async (req, res) => {
        const pool = await poolPromise;
        let conn;

        try {
            const { destinationId } = req.params;

            // Debug logging
            console.log("📁 Itinerary file upload request received");
            console.log(
                "📄 File info:",
                req.file
                    ? {
                          filename: req.file.filename,
                          path: req.file.path,
                          size: req.file.size,
                          mimetype: req.file.mimetype,
                      }
                    : "No file"
            );
            console.log("📋 Body fields:", req.body);

            const {
                locationName,
                latitude,
                longitude,
            } = req.body;

            // Build image URL from uploads/itinerary folder
            let captureImageUrl = null;

            if (req.file) {
                captureImageUrl =
                    `${req.protocol}://${req.get("host")}` +
                    `/uploads/itinerary/${req.file.filename}`;
            }

            conn = await pool.connect();

            // Check destination ownership
            const check = await conn
                .request()
                .input(
                    "DestinationId",
                    sql.UniqueIdentifier,
                    destinationId
                )
                .input(
                    "UserId",
                    sql.UniqueIdentifier,
                    req.user.userId
                )
                .query(`
                    SELECT 1
                    FROM Destination
                    WHERE DestinationId = @DestinationId
                      AND UserId = @UserId
                `);

            if (check.recordset.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "Not allowed",
                });
            }

            // Insert itinerary
            await conn
                .request()
                .input(
                    "DestinationId",
                    sql.UniqueIdentifier,
                    destinationId
                )
                .input(
                    "LocationName",
                    sql.NVarChar,
                    locationName
                )
                .input(
                    "Latitude",
                    sql.Decimal(10, 8),
                    latitude
                )
                .input(
                    "Longitude",
                    sql.Decimal(11, 8),
                    longitude
                )
                .input(
                    "CaptureImage",
                    sql.NVarChar,
                    captureImageUrl
                )
                .query(`
                    INSERT INTO Itinerary
                    (
                        DestinationId,
                        LocationName,
                        Latitude,
                        Longitude,
                        CaptureImage
                    )
                    VALUES
                    (
                        @DestinationId,
                        @LocationName,
                        @Latitude,
                        @Longitude,
                        @CaptureImage
                    )
                `);

            return res.json({
                success: true,
                message: "Itinerary created successfully",
                data: {
                    captureImageUrl,
                },
            });
        } catch (err) {
            console.error(err);

            return res.status(500).json({
                success: false,
                message: err.message,
            });
        } finally {
            if (conn) conn.close();
        }
    }
);

router.get("/:destinationId", auth, async (req, res) => {
    const pool = await poolPromise;
    let conn;
    try {
        const { destinationId } = req.params;

        conn = await pool.connect();

        const result = await conn.request()
            .input("DestinationId", sql.UniqueIdentifier, destinationId)
            .input("UserId", sql.UniqueIdentifier, req.user.userId)
            .query(`
                SELECT I.*
                FROM Itinerary I
                INNER JOIN Destination D
                    ON D.DestinationId = I.DestinationId
                WHERE I.DestinationId = @DestinationId
                AND D.UserId = @UserId
                ORDER BY I.CreatedAt ASC
            `);

        return res.json(result.recordset);

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    } finally {
        if (conn) conn.close();
    }
});

module.exports = router;