// kinlife360: Receives location pings from your phone and sends
// messages to your Kin about your whereabouts.
//
// Required env vars:
//   KINDROID_API_KEY    - Your Kindroid API key
//   KINDROID_AI_ID      - Kin's AI ID. Supports multiple Kins by
//                         providing a comma-separated list of AI IDs
//                         (e.g. "id1,id2,id3").
//
// Optional env vars:
//   LOCATION_UPDATE_METHOD - How to deliver location updates:
//     "send-message"  (default) - send as a user message
//     "update-scene"  - update the Kin's current scene
//     "both"          - send a message AND update the scene
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

const VALID_UPDATE_METHODS = ["send-message", "update-scene", "both"];

function parseUpdateMethod() {
  const method = (process.env.LOCATION_UPDATE_METHOD || "send-message").toLowerCase();
  if (!VALID_UPDATE_METHODS.includes(method)) {
    console.error(`Invalid LOCATION_UPDATE_METHOD "${method}". Must be one of: ${VALID_UPDATE_METHODS.join(", ")}`);
    process.exit(1);
  }
  return method;
}

const CONFIG = {
  kindroidKey: requiredEnv("KINDROID_API_KEY"),
  aiIds: parseAiIds(requiredEnv("KINDROID_AI_ID")),
  updateMethod: parseUpdateMethod(),
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

async function updateSceneForKin(aiId, scene) {
  const res = await fetch(`${KINDROID_BASE}/update-info`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.kindroidKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ai_id: aiId,
      current_scene: scene,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Kindroid API ${res.status}: ${await res.text()}`);
  }
}

function broadcastToKins(label, perKinFn) {
  return async function (content) {
    const results = await Promise.allSettled(
      CONFIG.aiIds.map((aiId) => perKinFn(aiId, content))
    );

    const failures = [];
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        failures.push(`${CONFIG.aiIds[i]}: ${result.reason.message}`);
      }
    });

    if (failures.length > 0) {
      const summary = `Failed to ${label} for ${failures.length}/${CONFIG.aiIds.length} Kin(s): ${failures.join("; ")}`;
      if (failures.length === CONFIG.aiIds.length) {
        throw new Error(summary);
      }
      console.error(summary);
    }
  };
}

const sendMessage = broadcastToKins("send message", sendToKin);
const updateScene = broadcastToKins("update scene", updateSceneForKin);

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
    const method = CONFIG.updateMethod;
    const promises = [];
    const actions = [];

    if (method === "send-message" || method === "both") {
      const message = knownLocation
        ? `📍**<Automated Update:** *[user] is ${knownLocation}>*`
        : `📍**<Automated Update:** *[user] is in transit.>*`;
      promises.push(sendMessage(message));
      actions.push(`message: "${message}"`);
    }

    if (method === "update-scene" || method === "both") {
      const scene = knownLocation
        ? `[user] is currently ${knownLocation}.`
        : `[user] is currently in transit.`;
      promises.push(updateScene(scene));
      actions.push(`scene: "${scene}"`);
    }

    await Promise.all(promises);
    console.log(`[${ts}] Sent update (${method}): ${actions.join(", ")}`);

    res.json({ success: true, method, actions });
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
    recipients: CONFIG.aiIds.length,
    updateMethod: CONFIG.updateMethod,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Location logger listening on port ${PORT}`);
  console.log(`Loaded ${LOCATION_MAPPINGS.length} location mappings`);
  console.log(`Sending updates to ${CONFIG.aiIds.length} Kin(s)`);
  console.log(`Update method: ${CONFIG.updateMethod}`);
});