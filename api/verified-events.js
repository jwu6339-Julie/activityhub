const fs = require("fs");
const path = require("path");

module.exports = function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "verified-events.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const events = JSON.parse(raw);

    if (!Array.isArray(events)) {
      return res.status(500).json({
        success: false,
        message: "verified-events.json must be an array"
      });
    }

    return res.status(200).json({
      success: true,
      events,
      totalVerified: events.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load verified events",
      error: error.message
    });
  }
};
