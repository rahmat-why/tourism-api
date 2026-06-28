const axios = require("axios");

async function getCoordinates(destinationName, provinceName) {

    const keyword =
        `${destinationName}, ${provinceName}, Indonesia`;

    const response = await axios.get(
        "https://nominatim.openstreetmap.org/search",
        {
            params: {
                q: keyword,
                format: "jsonv2",
                limit: 1
            },
            headers: {
                "User-Agent": "tourism-app"
            }
        }
    );

    if (!response.data.length) {
        return null;
    }

    return {
        latitude: parseFloat(response.data[0].lat),
        longitude: parseFloat(response.data[0].lon)
    };
}

module.exports = {
    getCoordinates
};