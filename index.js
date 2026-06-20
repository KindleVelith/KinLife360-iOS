// kinlife360: Receives location pings from your phone and sends
// messages to your Kin about your whereabouts.
//
// Required env vars:
//   KINDROID_API_KEY    - Your Kindroid API key
//   KINDROID_AI_ID      - Kin's AI ID. Supports multiple Kins by
//                         providing a comma-separated list of AI IDs
//                         (e.g. "id1,id2,id3").
//
// Location mappings (optional):
//   HOME_LAT, HOME_LON, HOME_NAME
//   WORK_LAT, WORK_LON, WORK_NAME
//   (add as many as needed with this pattern)

const express = require("express");

const KINDROID_BASE = "https://api.kindroid.ai/v1";

// --- Config ---

function requiredEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return val;
}

function parseAiIds(raw) {
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (ids.length === 0) {
    console.error("KINDROID_AI_ID did not contain any valid AI IDs");
    process.exit(1);
  }
  return ids;
}

const CONFIG = {
  kindroidKey: requiredEnv("KINDROID_API_KEY"),
  aiIds: parseAiIds(requiredEnv("KINDROID_AI_ID")),
};

// --- Location mapping ---

function parseLocationMappings() {
  const mappings = [];
  const env = process.env;
  
  for (const key in env) {
    if (key.endsWith('_LAT')) {
      const prefix = key.slice(0, -4);
      const lat = parseFloat(env[`${prefix}_LAT`]);
      const lon = parseFloat(env[`${prefix}_LON`]);
      const name = env[`${prefix}_NAME`];
      
      if (!isNaN(lat) && !isNaN(lon) && name) {
        mappings.push({ lat, lon, name });
        console.log(`Loaded location: ${name} at ${lat}, ${lon}`);
      }
    }
  }
  return mappings;
}

const LOCATION_MAPPINGS = parseLocationMappings();

function findNearestLocation(lat, lon) {
  const threshold = 0.003; // ~300m radius
  
  for (const loc of LOCATION_MAPPINGS) {
    const distance = Math.sqrt(
      Math.pow(lat - loc.lat, 2) + Math.pow(lon - loc.lon, 2)
    );
    if (distance < threshold) return loc.name;
  }
  return null;
}

// --- Kindroid ---

async function sendToKin(aiId, text) {
  const res = await fetch(`${KINDROID_BASE}/send-message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.kindroidKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ai_id: aiId,
      message: text,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Kindroid API ${res.status}: ${await res.text()}`);
  }
}

// Sends the message to every configured Kin. Delivery is attempted for
// all recipients even if some fail; an error is thrown only if every
// recipient failed.
async function sendMessage(text) {
  const results = await Promise.allSettled(
    CONFIG.aiIds.map((aiId) => sendToKin(aiId, text))
  );

  const failures = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      failures.push(`${CONFIG.aiIds[i]}: ${result.reason.message}`);
    }
  });

  if (failures.length > 0) {
    const summary = `Failed to send to ${failures.length}/${CONFIG.aiIds.length} Kin(s): ${failures.join("; ")}`;
    if (failures.length === CONFIG.aiIds.length) {
      throw new Error(summary);
    }
    console.error(summary);
  }
}

// --- Express server ---

const app = express();
app.use(express.json());

app.post("/api/log-location", async (req, res) => {
  const ts = new Date().toISOString();
  
  let latitude = req.body.latitude;
  let longitude = req.body.longitude;

  console.log(`[${ts}] Raw body:`, JSON.stringify(req.body));
  console.log(`[${ts}] Location ping: ${latitude}, ${longitude}`);

  try {
    const knownLocation = findNearestLocation(latitude, longitude);
    const message = knownLocation 
      ? `📍**<Automated Update:** *[user] is ${knownLocation}>*`
      : `📍**<Automated Update:** *[user] is in transit.>*`;

    await sendMessage(message);
    console.log(`[${ts}] Sent message: "${message}"`);
    
    res.json({ success: true, message });
  } catch (err) {
    console.error(`[${ts}] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "kinlife360",
    mappings: LOCATION_MAPPINGS.length,
    recipients: CONFIG.aiIds.length
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Location logger listening on port ${PORT}`);
  console.log(`Loaded ${LOCATION_MAPPINGS.length} location mappings`);
  console.log(`Sending updates to ${CONFIG.aiIds.length} Kin(s)`);
});