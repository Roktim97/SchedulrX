import { parseDate } from "chrono-node";
const HUGGINGFACE_API_TOKEN = "";

export async function fetchRecentEmails(token, count = 50) {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${count}&q=in:inbox`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const { messages } = await response.json();
  const results = [];

  for (const msg of messages || []) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const email = await res.json();
    const hasCalendarAttachment = hasIcsAttachment(email);
    // if (hasCalendarAttachment) {
    //   const icsPart = email.payload.parts.find(part => part.mimeType === "application/ics")
    //   const icsText = await getAttachmentData(email.id, icsPart.body.attachmentId, token)
    //   if (!isIST(icsText)) {
    //     const subject = email.payload.headers.find(h => h.name === "Subject")?.value;
    //     results.push({ id: msg.id, icsText, textContent: "Convert time to IST and add to calender", subject })
    //   }
    // }
    const parts = email.payload.parts || [];

    const textPart = parts.find(part => part.mimeType === "text/plain");
    if (textPart && textPart.body && textPart.body.data && !hasCalendarAttachment) {
      const textContent = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      const subject = email.payload.headers.find(h => h.name === "Subject")?.value;
      const snippet = email.snippet
      results.push({ id: msg.id, snippet, textContent, subject });
    }
  }

  return results;
}

// async function getAttachmentData(messageId, attachmentId, token) {
//   const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;

//   const response = await fetch(url, {
//     headers: {
//       Authorization: `Bearer ${token}`,
//     },
//   });

//   if (!response.ok) {
//     throw new Error("Failed to fetch attachment");
//   }

//   const result = await response.json();
//   const base64 = result.data;

//   // Gmail uses base64url encoding, convert to base64
//   const base64Fixed = base64.replace(/-/g, "+").replace(/_/g, "/");

//   // Decode base64 to plain text
//   const decoded = atob(base64Fixed);
//   return decoded;
// }


// Use chrono to parse datetime and determine if it's a schedulable message
const meetingKeywords = [
  "meeting", "call", "discussion", "schedule", "catch up", "appointment",
  "sync", "standup", "check-in", "check in", "review", "brainstorm",
  "touch base", "zoom", "google meet", "teams", "hangout", "conference",
  "connect", "session", "demo", "kickoff", "interview", "presentation",
  "strategy session", "one-on-one", "1:1", "talk", "chat", "planning"
];

function isLikelyMeeting(text) {
  const lowerText = text;
  const hasKeyword = meetingKeywords.some(word => lowerText.includes(word));

  // Try to parse full datetime from text
  const parsedDate = parseDate(text, new Date(), { forwardDate: true });

  const isFutureTime =
    parsedDate instanceof Date &&
    !isNaN(parsedDate.getTime()) &&
    parsedDate > new Date();

  return hasKeyword && isFutureTime;
}

export async function isMeetingContent(text) {
  try {
    if (!isLikelyMeeting(text)) return false

    const response = await fetch("https://api-inference.huggingface.co/models/facebook/bart-large-mnli", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUGGINGFACE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          candidate_labels: ["meeting", "not a meeting", "casual", "spam"],
        },
      }),
    });

    const result = await response.json();
    const topLabel = result?.labels?.[0];
    const topScore = result?.scores?.[0];

    console.log(topLabel, topScore)

    return topLabel === "meeting" && topScore > 0.75;
  } catch (err) {
    console.error("Error calling Hugging Face API:", err);
    return false;
  }
}


export function parseTimeFromText(text) {
  const parsedDate = parseDate(text, new Date(), { forwardDate: true });

  if (!parsedDate) return null;

  // Convert to IST timezone
  const istTime = new Date(parsedDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return istTime.toISOString();
}

function hasIcsAttachment(email) {
  const parts = email.payload?.parts || [];
  return parts.some(part =>
    part.filename?.toLowerCase().endsWith(".ics") ||
    part.mimeType === "text/calendar"
  );
}

export async function addToCalendar(token, title, startTime, endTime) {
  const event = {
    summary: title,
    start: { dateTime: startTime, timeZone: "Asia/Kolkata" },
    end: { dateTime: endTime, timeZone: "Asia/Kolkata" },
  };

  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return await response.json();
}

// function isIST(icsText) {
//   return icsText.includes("TZID=Asia/Kolkata")
// }

// export function convertICSToIST(icsText) {
//   // Match DTSTART and its timezone
//   const dtstartMatch = icsText.match(/DTSTART(?:;TZID=([^:]+))?:(\d{8}T\d{6})/);

//   if (!dtstartMatch) return null;

//   const timezone = dtstartMatch[1] || "UTC"; // default to UTC if no TZID
//   const raw = dtstartMatch[2]; // e.g., 20250804T150000

//   const year = parseInt(raw.slice(0, 4));
//   const month = parseInt(raw.slice(4, 6)) - 1; // JS months are 0-based
//   const day = parseInt(raw.slice(6, 8));
//   const hour = parseInt(raw.slice(9, 11));
//   const minute = parseInt(raw.slice(11, 13));
//   const second = parseInt(raw.slice(13, 15));

//   // Create a date in the original timezone using Intl.DateTimeFormat
//   const utcDate = new Date(Date.UTC(year, month, day, hour, minute, second));

//   // Convert to IST
//   const istString = utcDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
//   const istDate = new Date(istString);

//   return istDate.toISOString();
// }
