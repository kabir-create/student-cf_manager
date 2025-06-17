# student-cf_manager
 # 🧑‍🎓 Codeforces Student Manager (CF Manager)

A full-stack platform for managing and visualizing the Codeforces activity of students — contests, problem solving performance, submission heatmaps, rating progression, and more. Built with **Node.js**, **SQLite**, **TailwindCSS**, and **Chart.js**.

---

## 🚀 Features

- 📈 Visualize student rating trends across contests
- 📊 Problem-solving statistics (total solved, average difficulty, hardest problem)
- 🔥 Submission heatmap (GitHub-style)
- ⏳ Filters for 30/90/365 day performance
- ⚙️ Admin dashboard to:
  - Add / Edit / Delete students
  - View reminders sent
  - Toggle email reminders
  - Export student data as CSV
- 🌗 Light/Dark mode toggle
- 📧 Automatic daily sync + reminder system via cron (2AM)
- 📦 Lightweight with local SQLite storage

---

## 📁 Project Structure

cf_manager/
│
├── server.js # Express server with API and cron jobs
├── students.db # SQLite database (auto-generated)
├── public/
│ ├── index.html # Dashboard for student list + admin tools
│ └── profile.html # Profile page with charts and stats
├── package.json # Dependencies
├── .env # Environment variables
└── README.md # You're here!
"C:\Users\tanis\OneDrive\Pictures\Screenshots\Screenshot (353).png"
"C:\Users\tanis\OneDrive\Pictures\Screenshots\Screenshot (354).png"
"C:\Users\tanis\OneDrive\Pictures\Screenshots\Screenshot (355).png"
### 🎥 Demo

<video src="C:\Users\tanis\Videos\Captures" controls width="600"></video>

