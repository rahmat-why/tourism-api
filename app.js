require("dotenv").config();

const express = require("express");
const app = express();
const fs = require("fs");
const path = require("path");

const cors = require("cors");

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log("Uploads folder created");
}

app.use(cors());

app.use(express.json());

// Serve static files from uploads folder
app.use('/uploads', express.static('uploads'));

app.use(
    "/api/destinations",
    require("./routes/destination")
);

app.use(
    "/api/itineraries",
    require("./routes/itinerary")
);

app.use(
    "/api/provinces",
    require("./routes/province")
);

app.use(
    "/api/auth",
    require("./routes/auth")
);

app.listen(process.env.PORT, () => {
    console.log(
        `Server running on port ${process.env.PORT}`
    );
});