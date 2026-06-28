const express = require("express");
const router = express.Router();

const axios = require("axios");
const { sql, poolPromise } = require("../db");

router.get("/", async (req, res) => {
    const pool = await poolPromise;
    let conn;
    try {
        const { keyword } = req.query;

        conn = await pool.connect();

        let query = `
            SELECT
                ProvinceId,
                Name
            FROM Province
        `;

        const request = conn.request();

        if (keyword) {
            query += `
                WHERE Name LIKE '%' + @Keyword + '%'
            `;
            request.input("Keyword", sql.NVarChar, keyword);
        }

        query += ` ORDER BY Name ASC`;

        const result = await request.query(query);

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

router.get("/:provinceId/location-weather", async (req, res) => {
    const pool = await poolPromise;
    let conn;
    try {
        const { provinceId } = req.params;

        conn = await pool.connect();

        const provinceResult = await conn.request()
            .input("ProvinceId", sql.Int, provinceId)
            .query(`
                SELECT
                    ProvinceId,
                    Name
                FROM Province
                WHERE ProvinceId = @ProvinceId
            `);

        if (provinceResult.recordset.length === 0) {
            conn.close();
            return res.status(404).json({
                success: false,
                message: "Province not found"
            });
        }

        const province = provinceResult.recordset[0];
        conn.close();

        // Get coordinates from Nominatim
        const locationResponse = await axios.get(
            "https://nominatim.openstreetmap.org/search",
            {
                params: {
                    q: `${province.Name}, Indonesia`,
                    format: "json",
                    limit: 1
                },
                headers: {
                    "User-Agent": "TourismApp/1.0"
                }
            }
        );

        if (locationResponse.data.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Location not found"
            });
        }

        const location = locationResponse.data[0];
        const latitude = parseFloat(location.lat);
        const longitude = parseFloat(location.lon);

        // Get weather from Open-Meteo
        const weatherResponse = await axios.get(
            "https://api.open-meteo.com/v1/forecast",
            {
                params: {
                    latitude,
                    longitude,
                    current: "temperature_2m,relative_humidity_2m,weather_code"
                }
            }
        );

        const current = weatherResponse.data.current;

        let condition = "Unknown";

        switch (current.weather_code) {
            case 0:
                condition = "Sunny";
                break;

            case 1:
            case 2:
                condition = "Partly Cloudy";
                break;

            case 3:
                condition = "Cloudy";
                break;

            case 45:
            case 48:
                condition = "Foggy";
                break;

            case 51:
            case 53:
            case 55:
            case 61:
            case 63:
            case 65:
            case 80:
            case 81:
            case 82:
                condition = "Rainy";
                break;

            case 95:
            case 96:
            case 99:
                condition = "Thunderstorm";
                break;
        }

        let temperatureStatus = "Warm";

        if (current.temperature_2m >= 32) {
            temperatureStatus = "Very Hot";
        } else if (current.temperature_2m >= 28) {
            temperatureStatus = "Hot";
        } else if (current.temperature_2m >= 24) {
            temperatureStatus = "Warm";
        } else if (current.temperature_2m >= 20) {
            temperatureStatus = "Cool";
        } else {
            temperatureStatus = "Cold";
        }

        let humidityStatus = "Comfortable";

        if (current.relative_humidity_2m < 40) {
            humidityStatus = "Dry";
        } else if (current.relative_humidity_2m > 70) {
            humidityStatus = "Humid";
        }

        return res.json({
            success: true,
            data: {
                provinceId: province.ProvinceId,
                provinceName: province.Name,
                location: {
                    latitude,
                    longitude
                },
                weather: {
                    temperature: current.temperature_2m,
                    humidity: current.relative_humidity_2m,
                    weatherCode: current.weather_code,
                    condition,
                    temperatureStatus,
                    humidityStatus
                }
            }
        });

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