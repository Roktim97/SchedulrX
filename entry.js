import { getOAuthToken } from "./oauth2";
import { addToCalendar, fetchRecentEmails, isMeetingContent, parseTimeFromText } from "./utils";

document.getElementById("login").addEventListener("click", async () => {
  try {
    const token = await getOAuthToken();
    document.getElementById("output").textContent = "Authenticated!";
  } catch (err) {
    document.getElementById("output").textContent = "Auth failed: " + err.message;
  }
});

document.getElementById("fetchEmails").addEventListener("click", async () => {
  const fetchButton = document.getElementById("fetchEmails");
  const originalText = fetchButton.textContent;
  fetchButton.textContent = "Fetching...";
  fetchButton.disabled = true;

  try {
    const token = await getOAuthToken();
    console.log(token)
    const emails = await fetchRecentEmails(token, 20);
    console.log(emails, "emails")
    const output = document.getElementById("output");
    output.innerHTML = "";

    const meetingChecks = await Promise.all(
      emails.map(async email => {
        const isMeeting = await isMeetingContent(email.textContent, email.icsText)
        return isMeeting ? email : null
      })
    )

    const meetingEmails = meetingChecks.filter(email => email !== null)

    console.log(meetingEmails, "meeting Emails")

    if (meetingEmails.length === 0) {
      output.innerHTML = "No meeting-related emails found.";
      return;
    }

    for (const email of meetingEmails) {
      const div = document.createElement("div");
      const parsedTime = parseTimeFromText(email.textContent);

      div.innerHTML = `
        <strong>${email.subject}</strong><br/>
        ${email.snippet}<br/>
        <em>${parsedTime ? `Scheduled for: ${parsedTime}` : 'No time parsed'}</em><br/>
        <button ${parsedTime ? "" : "disabled"}>Add to Calendar</button><hr/>
      `;

      if (parsedTime) {
        div.querySelector("button").onclick = async () => {
          const start = new Date(parsedTime);
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          const event = await addToCalendar(token, email.subject, start.toISOString(), end.toISOString());
          alert("Event added: " + event.htmlLink);
        };
      }

      output.appendChild(div);
    }
  } catch (err) {
    console.error(err)
    document.getElementById("output").textContent = "Error: " + err.message;
  } finally {
    fetchButton.textContent = originalText;
    fetchButton.disabled = false;
  }
});