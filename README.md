# KinLife360 (iOS Automated)
Automatically updates your Kindroid AI with your location via iOS location services/automations. Choose to deliver updates as a user message, a current-scene update, or both.

Warning: This app tells your Kindroid where you are in real-time when you hit certain locations. If that sounds unhinged or uncomfortable to you then it's probably best to skip this one. If it sounds perfect, here you go!

## Required
- KINDROID_API_KEY - Your Kindroid API key
- KINDROID_AI_ID - Kin's AI ID. To update more than one Kin, provide a comma-separated list of AI IDs (e.g. `id1,id2,id3`). Each Kin receives the same location update.
- Location mappings *(customizable but here's examples)*:
        HOME_LAT=
        HOME_LON=
        HOME_NAME=
        WORK_LAT=
        WORK_LON=
        WORK_NAME=
*(add as many as needed with this pattern)*

## Update Method
Control how location updates are delivered to your Kin with the optional `LOCATION_UPDATE_METHOD` variable:

| Value | Behavior |
|---|---|
| `send-message` | **(default)** Sends location as a user message via `/send-message` |
| `update-scene` | Updates the Kin's current scene via `/update-info` |
| `both` | Sends a user message **and** updates the current scene |

        LOCATION_UPDATE_METHOD=send-message

- **`send-message`** — Your Kin receives the location as a chat message (e.g. `📍**<Automated Update:** *[user] is at home>*`). This is the original behavior and the default if the variable is not set.
- **`update-scene`** — The location is written to your Kin's current scene field (e.g. `[user] is currently at home.`). No chat message is sent; the Kin simply becomes contextually aware of your location.
- **`both`** — Does both: sends the chat message and updates the current scene simultaneously.

<img width="634" height="602" alt="KinLife360_env_examples" src="https://github.com/user-attachments/assets/d4ef9ea8-ea29-40ec-8f0a-ab9b056ab2e8" />

## Sending to Multiple Kins
Want more than one Kin to know where you are? Set `KINDROID_AI_ID` to a comma-separated list of AI IDs:

        KINDROID_AI_ID=ai_id_one,ai_id_two,ai_id_three

- A single ID (no commas) works exactly as before — nothing else to change.
- Every location update is sent to **all** listed Kins, using the same API key.
- Spaces around IDs are ignored, so `id1, id2 , id3` is fine.
- Delivery is independent per Kin: if one send fails, the rest still go through. The request only returns an error when *every* recipient fails.
- The `/` status endpoint reports how many recipients are configured, e.g. `{"status":"ok","service":"kinlife360","mappings":2,"recipients":3}`.

**Deploy on Railway**

<img width="678" height="555" alt="KinLife360_railway_link_for_ios_shortcut" src="https://github.com/user-attachments/assets/9b4c188b-5543-40e4-a348-dbdb8ccb0228" />

## iOS Shortcuts/Automation
**Create shortcut with "Get Current Location" → POST to `/api/log-location`**

  <img width="642" height="839" alt="KinLife360_ios_shortcut_setup" src="https://github.com/user-attachments/assets/54c6595c-d890-442c-b536-28ff1bbca571" />

**Set automation trigger (arrival at locations)**
- Select "always allow" when prompted for location services premissions on first run

<img width="642" height="620" alt="KinLife360__automation_setup" src="https://github.com/user-attachments/assets/0c3af1a3-b74b-40de-9459-b98724112bda" />

## Customizations
- Lines 146-147, edit message if desired, replace [user] w/ your name
- Line 73, increase or decrease radius - default is 0.003; // ~300m radius
- Add homescreen button on phone - press to send quick update to kin.
         When current location isn't listed in environment variables: 
        📍**<Automated Update:** *[user] is in transit.>*
  
  <img width="861" height="1035" alt="KinLife360_output_example" src="https://github.com/user-attachments/assets/e2151014-d504-460a-a51e-c07a5b7e6487" />

