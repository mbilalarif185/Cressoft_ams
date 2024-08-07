const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const path = require('path');

const app = express();
const PORT = 9000;

const pool = new Pool({
  connectionString: "postgres://default:Sd9k5QPpcCXK@ep-crimson-bar-a4b1xjdd-pooler.us-east-1.aws.neon.tech:5432/verceldb?sslmode=require",
});

app.set('views', path.join(__dirname, 'views'));
app.set("view engine", "pug");
app.use(express.static(path.join(__dirname, 'public')));

app.use("/static", express.static("static"));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    store: new pgSession({
      pool: pool, // Connection pool
      tableName: 'session' // Use the existing table "session"
    }),
    secret: "my-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
  })
);

app.get('/', (req, res) => {
  res.render('login', { title: 'Home' });
});

app.post("/loginAction", async (req, res) => {
  //console.log(req.body)
  const { email, password } = req.body;
  const query = "SELECT * FROM login WHERE email = $1 AND password = $2";
  const values = [email, password];
  //console.log(values)
  try {
    const result = await pool.query(query, values);
    const user = result.rows[0];

    if (user) {
      req.session.userId = user.id;
      console.log(user.id)
      if (user.role.toLowerCase().trim() === "admin") {
        req.session.user = user;
        let userId = user.id;
        res.render("admin_dashboard", { user: user });
      } else if (user.role.toLowerCase().trim() === "content writer") {
        req.session.user = user;
        res.render("dashboard", { user: user });
      } else if (user.role.toLowerCase().trim() === "intern") {
        req.session.user = user;
        res.render("dashboard", { user: user });
      } else {
        req.session.user = user;
        res.render("dashboard", { user: user });
      }
    } else {
      res.render("login", {
      error: "Login Credentials are wrong.",
    });
    }
  } catch (error) {
    console.error("Error executing query", error);
    res.status(500).send("Internal Server Error");
  }
});
////Daily Tasks Report
app.get("/daily_tasks_report", async (req, res) => {
  const user = req.session.user;
  if (user && user.role.trim().toLowerCase() === 'admin') {
    res.render("daily_tasks_report", { userName: user.name });
  } else {
    res.redirect("/");
  }
});

app.post('/daily_tasks_report', async (req, res) => {
  const { name, date } = req.body;

  console.log("Name:", name);
  console.log("Date:", date);

  async function generateDailyTasksReport(name, date) {
    try {
      const query = `
        SELECT task_date, task_description
        FROM tasks
        WHERE task_date::date = $1::date
          AND employee_id IN (
            SELECT id
            FROM login
            WHERE lower(name) ILIKE lower($2)
          )
        ORDER BY task_date;
      `;
      const values = [date, `%${name}%`];
      const result = await pool.query(query, values);

      return result.rows; // Return the rows from the query result
    } catch (error) {
      console.error('Error generating daily tasks report:', error);
      throw error; // Throw the error for handling in the caller function
    }
  }

  try {
    const reportData = await generateDailyTasksReport(name, date);

    reportData.forEach((record) => {
      record.task_date = new Date(record.task_date).toDateString().slice(0, 10);
    });
    res.render('dailytasks_report', { reportData, date });
  } catch (error) {
    console.error('Error generating daily tasks report:', error);
    res.status(500).send('Error generating daily tasks report');
  }
});


///Employee Daily Tasks
app.get("/daily_tasks", async (req, res) => {
  user = req.session.user;
  console.log(user)
  if (user) {
    res.render("daily_tasks", { userName: user.name });
  } else {
    res.redirect("/");
  }
});

app.post('/daily_tasks', async (req, res) => {
  const user = req.session.user;
  const { name, task_date, task_description } = req.body;

  console.log("Name:", name);
  console.log("Task Date:", task_date);
  console.log("Task Description:", task_description);

  async function insertTask(employeeId, taskDate, taskDescription) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const queryText = 'INSERT INTO tasks(employee_id, task_date, task_description) VALUES($1, $2, $3)';
      await client.query(queryText, [employeeId, taskDate, taskDescription]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error inserting task:', error);
      throw error; // Throw the error for handling in the caller function
    } finally {
      client.release();
    }
  }

  try {
    const employeeId = user.id; // Assuming the user session contains the employee ID

    // Insert the task into the tasks table
    await insertTask(employeeId, task_date, task_description);

    res.send('Task successfully added');
  } catch (error) {
    console.error('Error inserting task:', error);
    res.status(500).send('Error inserting task');
  }
});

/// Mark Absent
app.get("/admin_mark_absent", async (req, res) => {
  const user = req.session.user;
  if (user && user.role.trim().toLowerCase() === 'admin') {
    res.render("admin_mark_absent", { userName: user.name });
  } else {
    res.redirect("/");
  }
});
app.post("/admin_mark_absent", async (req, res) => {
  const user = req.session.user;
  const { employeeName, date } = req.body;

  if (user && user.role.trim().toLowerCase() === 'admin') {
    try {
      // Find the user ID based on the provided employee name
      const userQuery = `
        SELECT id FROM login WHERE lower(name) LIKE lower($1);
      `;
      const userValues = [`%${employeeName.trim()}%`];
      const userResult = await pool.query(userQuery, userValues);

      if (userResult.rows.length === 0) {
        res.status(404).send("User not found.");
        return;
      }

      const employeeId = userResult.rows[0].id;

      // Insert or update the absence record in the leaves table
      const upsertQuery = `
        INSERT INTO leaves (user_id, start_date, end_date, reason, status)
        VALUES ($1, $2, $2, 'Marked Absent', 'absent')
        ON CONFLICT (user_id, start_date) 
        DO UPDATE SET status = EXCLUDED.status;
      `;
      const upsertValues = [employeeId, date];
      await pool.query(upsertQuery, upsertValues);

      res.redirect("/leave_history_admin");
    } catch (error) {
      console.error("Error marking absence:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/");
  }
});



///Individual Employee Monthly Working Hours
app.get("/employee_monthly_working_hours", async (req, res) => {
  user = req.session.user;
  //console.log(user)
  if (user) {
    res.render("employee_monthly_working_hours", { userName: user.name });
  } else {
    res.redirect("/");
  }
});
app.post('/employee_monthly_working_hours', async (req, res) => {
  const { name, year, month } = req.body;
  const user = req.session.user;

  // Find the user ID based on the provided name
  let userId;
  try {
    const userQuery = `
      SELECT id FROM login WHERE lower(name) LIKE lower($1);
    `;
    const userValues = [`%${name.trim()}%`];
    const userResult = await pool.query(userQuery, userValues);

    if (userResult.rows.length === 0) {
      res.status(404).send("User not found.");
      return;
    }

    userId = userResult.rows[0].id;
  } catch (error) {
    console.error("Error finding user ID:", error);
    res.status(500).send("Internal Server Error");
    return;
  }

  const daysInMonth = new Date(year, month, 0).getDate();

  try {
    const monthlyData = [];
    let NAME = '';

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

      const query = `
        SELECT name, check_in_time, check_out_time, reason, date
        FROM record
        WHERE (
          lower(name) LIKE lower($1) OR
          lower(name) LIKE lower($2) OR
          lower(name) LIKE lower($3)
        )
        AND date = $4 AND id = $5
        ORDER BY check_in_time;
      `;
      const values = [
        `%${name.split(' ')[0]}%`, // First part of the name
        `%${name.split(' ')[1]}%`, // Middle part of the name
        `%${name.split(' ')[2]}%`, // Last part of the name
        date,
        userId
      ];
      const result = await pool.query(query, values);

      if (result.rows.length > 0) {
        let totalMinutes = 0;
        let breakMinutes = 0;
        let officeWorkMinutes = 0;
        let otherMinutes = 0;

        for (let i = 0; i < result.rows.length; i++) {
          const row = result.rows[i];
          const checkInTime = row.check_in_time;
          NAME = row.name;
          const checkOutTime = row.check_out_time;
          const reason = row.reason.trim().toLowerCase(); // Trim and lower case the reason

          if (checkInTime && checkOutTime) {
            const checkInDateTime = new Date(`1970-01-01T${checkInTime}`);
            const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}`);
            const diffMs = checkOutDateTime - checkInDateTime;
            const diffMinutes = diffMs / 1000 / 60;

            totalMinutes += diffMinutes;
          }

          if (checkOutTime && i < result.rows.length - 1) {
            const nextRow = result.rows[i + 1];
            const nextCheckInTime = nextRow.check_in_time;
            if (nextCheckInTime) {
              const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}`);
              const nextCheckInDateTime = new Date(`1970-01-01T${nextCheckInTime}`);
              const diffMs = nextCheckInDateTime - checkOutDateTime;
              const diffMinutes = diffMs / 1000 / 60;

              if (reason === 'break') {
                breakMinutes += diffMinutes;
              } else if (reason.includes('office')) { // Check if reason contains "office"
                officeWorkMinutes += diffMinutes;
              } else {
                otherMinutes += diffMinutes;
              }
            }
          }
        }

        const totalHours = Math.floor(totalMinutes / 60);
        const totalMinutesRemainder = totalMinutes % 60;

        const breakHours = Math.floor(breakMinutes / 60);
        const breakMinutesRemainder = breakMinutes % 60;

        const officeWorkHours = Math.floor(officeWorkMinutes / 60);
        const officeWorkMinutesRemainder = officeWorkMinutes % 60;

        const otherHours = Math.floor(otherMinutes / 60);
        const otherMinutesRemainder = otherMinutes % 60;
        console.log("Name", NAME);
        monthlyData.push({
          NAME,
          date,
          totalHours,
          totalMinutesRemainder,
          breakHours,
          breakMinutesRemainder,
          officeWorkHours,
          officeWorkMinutesRemainder,
          otherHours,
          otherMinutesRemainder
        });
      }
    }
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    let monthname = '';
    if (month >= 1 && month <= 12) {
      monthname = months[month - 1]; // Months array is zero-based
    } else {
      throw new Error('Invalid month number');
    }
    console.log("Monthly Data:", monthlyData);
    res.render('employee_monthly_working_hours_report', { year, monthname, monthlyData });
  } catch (error) {
    console.error("Error executing query:", error);
    res.status(500).send("Internal Server Error");
  }
});

//Individual Employee Daily Working Hours



app.get("/employee_working_hours", async (req, res) => {
  user = req.session.user;
  //console.log(user)
  if (user) {
    res.render("employee_working_hours", { userName: user.name });
  } else {
    res.redirect("/");
  }
});

// app.post('/employee_working_hours', async (req, res) => {
//   const { name, date } = req.body;
//   const user = req.session.user;
  
//   // Find the user ID based on the provided name
//   let userId;
//   try {
//     const userQuery = `
//       SELECT id FROM login WHERE lower(name) LIKE lower($1);
//     `;
//     const userValues = [`%${name.trim()}%`];
//     const userResult = await pool.query(userQuery, userValues);
    
//     if (userResult.rows.length === 0) {
//       res.status(404).send("User not found.");
//       return;
//     }
    
//     userId = userResult.rows[0].id;
//   } catch (error) {
//     console.error("Error finding user ID:", error);
//     res.status(500).send("Internal Server Error");
//     return;
//   }

//   try {
//     const query = `
//       SELECT name, check_in_time, check_out_time, reason
//       FROM record
//       WHERE lower(name) LIKE lower($1)
//       AND date = $2 AND id = $3
//       ORDER BY check_in_time;
//     `;
//     const values = [
//       `%${name.split(' ')[0]}%`, // First part of the name
//       date,
//       userId
//     ];

//     console.log("Query:", query);
//     console.log("Values:", values);

//     const result = await pool.query(query, values);
//     console.log("Query Result:", result.rows);

//     if (result.rows.length === 0) {
//       res.status(404).send("No records found for the specified date.");
//       return;
//     }

//     let totalMinutes = 0;
//     let breakMinutes = 0;
//     let officeWorkMinutes = 0;
//     let otherMinutes = 0;
//     let NAME = '';
//     const shiftEndTime = new Date('1970-01-01T19:00:00Z');

//     for (let i = 0; i < result.rows.length; i++) {
//       const row = result.rows[i];
//       const checkInTime = row.check_in_time;
//       const checkOutTime = row.check_out_time;
//       NAME = row.name;
//       const reason = row.reason.trim().toLowerCase(); // Trim and lower case the reason

//       if (checkInTime && checkOutTime) {
//         const checkInDateTime = new Date(`1970-01-01T${checkInTime}Z`);
//         const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
//         const diffMs = checkOutDateTime - checkInDateTime;
//         const diffMinutes = diffMs / 1000 / 60;

//         totalMinutes += diffMinutes;
//       }

//       if (checkOutTime && i < result.rows.length - 1) {
//         const nextRow = result.rows[i + 1];
//         const nextCheckInTime = nextRow.check_in_time;
//         if (nextCheckInTime) {
//           const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
//           const nextCheckInDateTime = new Date(`1970-01-01T${nextCheckInTime}Z`);
//           const diffMs = nextCheckInDateTime - checkOutDateTime;
//           const diffMinutes = diffMs / 1000 / 60;

//           console.log(`Reason: "${reason}", Diff Minutes: ${diffMinutes}`);

//           if (reason === 'break') {
//             breakMinutes += diffMinutes;
//             console.log("BREAK");
//           } else if (reason.includes('office')) { // Check if reason contains "office"
//             officeWorkMinutes += diffMinutes;
//             console.log("OFFICE WORK");
//           } else {
//             otherMinutes += diffMinutes;
//             console.log("OTHER");
//           }
//         }
//       } else if (checkOutTime && i === result.rows.length - 1) {
//         // If this is the last check-out and there's no subsequent check-in, count time until shift end
//         const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
//         if (checkOutDateTime < shiftEndTime) {
//           const diffMs = shiftEndTime - checkOutDateTime;
//           const diffMinutes = diffMs / 1000 / 60;

//           if (reason === 'break') {
//             breakMinutes += diffMinutes;
//             console.log("BREAK");
//           } else if (reason.includes('office')) { // Check if reason contains "office"
//             officeWorkMinutes += diffMinutes;
//             console.log("OFFICE WORK");
//           } else {
//             otherMinutes += diffMinutes;
//             console.log("OTHER");
//           }
//         }
//       }
//     }

//     const totalHours = Math.floor(totalMinutes / 60);
//     const totalMinutesRemainder = totalMinutes % 60;

//     const breakHours = Math.floor(breakMinutes / 60);
//     const breakMinutesRemainder = breakMinutes % 60;

//     const officeWorkHours = Math.floor(officeWorkMinutes / 60);
//     const officeWorkMinutesRemainder = officeWorkMinutes % 60;

//     const otherHours = Math.floor(otherMinutes / 60);
//     const otherMinutesRemainder = otherMinutes % 60;

//     res.render('employee_working_hours_report', {
//       NAME,
//       date,
//       totalHours,
//       totalMinutesRemainder,
//       breakHours,
//       breakMinutesRemainder,
//       officeWorkHours,
//       officeWorkMinutesRemainder,
//       otherHours,
//       otherMinutesRemainder
//     });
//   } catch (error) {
//     console.error("Error executing query:", error);
//     res.status(500).send("Internal Server Error");
//   }
// });
app.post('/employee_working_hours', async (req, res) => {
  const { name, date } = req.body;
  const user = req.session.user;

  // Find the user ID based on the provided name
  let userId;
  try {
    const userQuery = `
      SELECT id FROM login WHERE lower(name) LIKE lower($1);
    `;
    const userValues = [`%${name.trim()}%`];
    const userResult = await pool.query(userQuery, userValues);

    if (userResult.rows.length === 0) {
      res.status(404).send("User not found.");
      return;
    }

    userId = userResult.rows[0].id;
  } catch (error) {
    console.error("Error finding user ID:", error);
    res.status(500).send("Internal Server Error");
    return;
  }

  try {
    const query = `
      SELECT name, check_in_time, check_out_time, reason
      FROM record
      WHERE lower(name) LIKE lower($1)
      AND date = $2 AND id = $3
      ORDER BY check_in_time;
    `;
    const values = [
      `%${name.split(' ')[0]}%`, // First part of the name
      date,
      userId
    ];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      res.status(404).send("No records found for the specified date.");
      return;
    }

    let totalMinutes = 0;
    let breakMinutes = 0;
    let officeWorkMinutes = 0;
    let otherMinutes = 0;
    let NAME = '';
    const shiftEndTime = new Date('1970-01-01T19:00:00Z');

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      const checkInTime = row.check_in_time;
      const checkOutTime = row.check_out_time;
      NAME = row.name;
      const reason = row.reason.trim().toLowerCase(); // Trim and lower case the reason

      if (checkInTime && checkOutTime) {
        const checkInDateTime = new Date(`1970-01-01T${checkInTime}Z`);
        const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
        const diffMs = checkOutDateTime - checkInDateTime;
        const diffMinutes = diffMs / 1000 / 60;

        totalMinutes += diffMinutes;
      }

      if (checkOutTime && i < result.rows.length - 1) {
        const nextRow = result.rows[i + 1];
        const nextCheckInTime = nextRow.check_in_time;
        if (nextCheckInTime) {
          const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
          const nextCheckInDateTime = new Date(`1970-01-01T${nextCheckInTime}Z`);
          const diffMs = nextCheckInDateTime - checkOutDateTime;
          const diffMinutes = diffMs / 1000 / 60;

          if (reason === 'break') {
            breakMinutes += diffMinutes;
          } else if (reason.includes('office')) { // Check if reason contains "office"
            officeWorkMinutes += diffMinutes;
          } else {
            otherMinutes += diffMinutes;
          }
        }
      } else if (checkOutTime && i === result.rows.length - 1) {
        // If this is the last check-out and there's no subsequent check-in, count time until shift end
        const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
        if (checkOutDateTime < shiftEndTime) {
          const diffMs = shiftEndTime - checkOutDateTime;
          const diffMinutes = diffMs / 1000 / 60;

          if (reason === 'break') {
            breakMinutes += diffMinutes;
          } else if (reason.includes('office')) { // Check if reason contains "office"
            officeWorkMinutes += diffMinutes;
          } else {
            otherMinutes += diffMinutes;
          }
        }
      }
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const totalMinutesRemainder = totalMinutes % 60;

    const breakHours = Math.floor(breakMinutes / 60);
    const breakMinutesRemainder = breakMinutes % 60;

    const officeWorkHours = Math.floor(officeWorkMinutes / 60);
    const officeWorkMinutesRemainder = officeWorkMinutes % 60;

    const otherHours = Math.floor(otherMinutes / 60);
    const otherMinutesRemainder = otherMinutes % 60;

    res.render('employee_working_hours_report', {
      NAME,
      date,
      totalHours,
      totalMinutesRemainder,
      breakHours,
      breakMinutesRemainder,
      officeWorkHours,
      officeWorkMinutesRemainder,
      otherHours,
      otherMinutesRemainder
    });
  } catch (error) {
    console.error("Error executing query:", error);
    res.status(500).send("Internal Server Error");
  }
});



app.get("/employee_monthly_report", async (req, res) => {
  user = req.session.user;
  console.log(user)
  if (user) {
    res.render("employee_monthly_report", { userName: user.name });
  } else {
    res.redirect("/");
  }
});
app.post('/employee_monthly_report', async (req, res) => {
  const user = req.session.user;
  const { name, year, month } = req.body;

  async function generateUserReportByNameAndMonth(name, year, month) {
    try {
      // Split the name into parts
      const nameParts = name.split(' ').filter(part => part.trim() !== '');
      let query = `
        SELECT name, check_in_time, check_out_time, date, type, reason, location
        FROM record
        WHERE date_part('year', date) = $1
        AND date_part('month', date) = $2
      `;

      const values = [year, month];
      nameParts.forEach((part, index) => {
        query += ` AND lower(name) ILIKE lower($${index + 3})`;
        values.push(`%${part}%`);
      });

      query += ' ORDER BY date, check_in_time';

      const result = await pool.query(query, values);

      return result.rows; // Return the rows from the query result
    } catch (error) {
      console.error('Error generating user report:', error);
      throw error; // Throw the error for handling in the caller function
    }
  }

  try {
    const reportData = await generateUserReportByNameAndMonth(name, year, month);

    reportData.forEach((record) => {
      record.date = new Date(record.date).toDateString().slice(0, 10);
    });

    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    let monthname = '';
    if (month >= 1 && month <= 12) {
      monthname = months[month - 1]; // Months array is zero-based
    } else {
      throw new Error('Invalid month number');
    }

    res.render('employee_monthly_attendance', { user, reportData, monthname, year });
  } catch (error) {
    console.error('Error generating user report:', error);
    res.status(500).send('Error generating user report');
  }
});


/// Individual EMployee Daily Attendance
app.get("/employee_daily_attendance", async (req, res) => {
  user = req.session.user;
  console.log(user)
  if (user) {
    res.render("daily_employee_attendance", { userName: user.name });
  } else {
    res.redirect("/");
  }
});

app.post('/employee_daily_attendance', async (req, res) => {
  const user = req.session.user;
  const { name, date } = req.body;
  
  console.log("Name:", name);

  async function generateUserReportByNameAndDate(name, date) {
    try {
      // Split the name into parts
      const nameParts = name.split(' ').filter(part => part.trim() !== '');
      let query = `
        SELECT name, check_in_time, check_out_time, date, reason, location
        FROM record
        WHERE date::date = $1::date
      `;

      const values = [date];
      nameParts.forEach((part, index) => {
        query += ` AND lower(name) ILIKE lower($${index + 2})`;
        values.push(`%${part}%`);
      });

      query += ' ORDER BY date, check_in_time';

      const result = await pool.query(query, values);

      return result.rows; // Return the rows from the query result
    } catch (error) {
      console.error('Error generating user report:', error);
      throw error; // Throw the error for handling in the caller function
    }
  }

  try {
    const reportData = await generateUserReportByNameAndDate(name, date);

    reportData.forEach((record) => {
      record.date = new Date(record.date).toDateString().slice(0, 10);
    });

    res.render('employee_oneday_report', { user, reportData, date });
  } catch (error) {
    console.error('Error generating user report:', error);
    res.status(500).send('Error generating user report');
  }
});

///leave management system
app.get("/apply_leave", (req, res) => {
  const user = req.session.user;
  console.log(user.name)
  if (user) {
    res.render("apply_leave", { userName: user.name });
  } else {
    res.redirect("/");
  }
});
app.post("/apply_leave", async (req, res) => {
  const user = req.session.user;
  const { start_date, end_date, reason } = req.body;
  const user_id = user.id;

  // Convert dates to Date objects for comparison
  const startDate = new Date(start_date);
  const endDate = new Date(end_date);

  // Check if the end date is before the start date
  if (endDate < startDate) {
    res.status(400).send("End date cannot be before start date.");
    return;
  }

  try {
    const query = `
      INSERT INTO leaves (user_id, start_date, end_date, reason)
      VALUES ($1, $2, $3, $4);
    `;
    const values = [user_id, start_date, end_date, reason];
    await pool.query(query, values);
    res.redirect("/leave_history");
  } catch (error) {
    console.error("Error applying for leave:", error);
    res.status(500).send("Internal Server Error");
  }
});


app.get("/leave_history", async (req, res) => {
  const user = req.session.user;
  console.log("User session:", user);  // Debugging line

  if (user) {
    try {
      const query = `
        SELECT leave_id, user_id, start_date, end_date, reason, status
        FROM leaves
        WHERE user_id = $1
        ORDER BY start_date DESC;
      `;
      const values = [user.id];
      const result = await pool.query(query, values);
      const leaves = result.rows;
      
      // Format the dates correctly and calculate approved and rejected leave days
      let approvedLeaveDays = 0;
      let rejectedLeaveDays = 0;

      leaves.forEach(leave => {
        leave.start_date = new Date(leave.start_date).toLocaleDateString();
        leave.end_date = new Date(leave.end_date).toLocaleDateString();
        
        const startDate = new Date(leave.start_date);
        const endDate = new Date(leave.end_date);
        const leaveDays = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1; // Calculate total days of leave

        if (leave.status === 'Approved') {
          approvedLeaveDays += leaveDays;
        } else if (leave.status === 'Rejected') {
          rejectedLeaveDays += leaveDays;
        }
      });

      res.render("leave_history", { userName: user.name, leaves, approvedLeaveDays, rejectedLeaveDays });
    } catch (error) {
      console.error("Error fetching leave records:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/");
  }
});

// app.get("/review_leaves", async (req, res) => {
//   const user = req.session.user;
//   console.log("User session:", user);  // Debugging line

//   if (user && user.role.trim().toLowerCase() === 'admin') {
//     try {
//       const query = `
//         SELECT leaves.leave_id, leaves.user_id, leaves.start_date, leaves.end_date, leaves.reason, leaves.status, login.name
//         FROM leaves
//         JOIN login ON leaves.user_id = login.id
//         WHERE leaves.status = 'Pending' AND login.role != 'admin'
//         ORDER BY leaves.start_date DESC;
//       `;
//       const result = await pool.query(query);
//       const leaves = result.rows;

//       // Format the dates correctly
//       leaves.forEach(leave => {
//         leave.start_date = new Date(leave.start_date).toLocaleDateString();
//         leave.end_date = new Date(leave.end_date).toLocaleDateString();
//       });

//       // Fetch all users and their leave counts, excluding admins
//       const usersQuery = `
//         SELECT id, name FROM login WHERE role != 'admin'
//       `;
//       const usersResult = await pool.query(usersQuery);
//       const users = usersResult.rows;

//       // Initialize leaveCounts object
//       const leaveCounts = {};

//       // Calculate approved and rejected leave days for each user
//       for (let user of users) {
//         leaveCounts[user.id] = {
//           approvedLeaveDays: 0,
//           rejectedLeaveDays: 0
//         };

//         const userLeavesQuery = `
//           SELECT start_date, end_date, status
//           FROM leaves
//           WHERE user_id = $1
//         `;
//         const userLeavesValues = [user.id];
//         const userLeavesResult = await pool.query(userLeavesQuery, userLeavesValues);
//         const userLeaves = userLeavesResult.rows;

//         userLeaves.forEach(leave => {
//           const startDate = new Date(leave.start_date);
//           const endDate = new Date(leave.end_date);
//           const leaveDays = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1; // Calculate total days of leave

//           if (leave.status === 'Approved') {
//             leaveCounts[user.id].approvedLeaveDays += leaveDays;
//           } else if (leave.status === 'Rejected') {
//             leaveCounts[user.id].rejectedLeaveDays += leaveDays;
//           }
//         });
//       }

//       res.render("review_leaves", { userName: user.name, leaves, users, leaveCounts });
//     } catch (error) {
//       console.error("Error fetching leave records:", error);
//       res.status(500).send("Internal Server Error");
//     }
//   } else {
//     res.redirect("/");
//   }
// });
app.get("/review_leaves", async (req, res) => {
  const user = req.session.user;
  console.log("User session:", user);  // Debugging line

  if (user && user.role.trim().toLowerCase() === 'admin') {
    try {
      const query = `
        SELECT leaves.leave_id, leaves.user_id, leaves.start_date, leaves.end_date, leaves.reason, leaves.status, login.name
        FROM leaves
        JOIN login ON leaves.user_id = login.id
        WHERE leaves.status = 'Pending' AND login.role != 'admin'
        ORDER BY leaves.start_date DESC;
      `;
      const result = await pool.query(query);
      const leaves = result.rows;

      // Format the dates correctly
      leaves.forEach(leave => {
        leave.start_date = new Date(leave.start_date).toLocaleDateString();
        leave.end_date = new Date(leave.end_date).toLocaleDateString();
      });

      // Fetch all users and their leave counts, excluding admins
      const usersQuery = `
        SELECT id, name FROM login WHERE role != 'admin'
      `;
      const usersResult = await pool.query(usersQuery);
      const users = usersResult.rows;

      // Initialize leaveCounts object
      const leaveCounts = {};

      // Calculate approved, rejected, and absent leave days for each user
      for (let user of users) {
        leaveCounts[user.id] = {
          approvedLeaveDays: 0,
          rejectedLeaveDays: 0,
          absentDays: 0
        };

        const userLeavesQuery = `
          SELECT start_date, end_date, status
          FROM leaves
          WHERE user_id = $1
        `;
        const userLeavesValues = [user.id];
        const userLeavesResult = await pool.query(userLeavesQuery, userLeavesValues);
        const userLeaves = userLeavesResult.rows;

        userLeaves.forEach(leave => {
          const startDate = new Date(leave.start_date);
          const endDate = new Date(leave.end_date);
          const leaveDays = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1; // Calculate total days of leave

          if (leave.status === 'Approved') {
            leaveCounts[user.id].approvedLeaveDays += leaveDays;
          } else if (leave.status === 'Rejected') {
            leaveCounts[user.id].rejectedLeaveDays += leaveDays;
          } else if (leave.status === 'absent') {
            leaveCounts[user.id].absentDays += leaveDays;
          }
        });
      }

      res.render("review_leaves", { userName: user.name, leaves, users, leaveCounts });
    } catch (error) {
      console.error("Error fetching leave records:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/");
  }
});


app.get("/admin_leave_history", async (req, res) => {
  const user = req.session.user;
  console.log("User session:", user);  // Debugging line

  if (user && user.role.trim().toLowerCase() === 'admin') {
    res.render("select_admin_leave_history", { userName: user.name });
  } else {
    res.redirect("/");
  }
});
// app.post("/admin_leave_history", async (req, res) => {
//   const user = req.session.user;
//   const { year, month } = req.body;
//   console.log("User session:", user);  // Debugging line

//   if (user && user.role.trim().toLowerCase() === 'developer') {
//     try {
//       const query = `
//         SELECT login.name, leaves.start_date, leaves.end_date, leaves.reason, leaves.status
//         FROM leaves
//         JOIN login ON leaves.user_id = login.id
//         WHERE EXTRACT(YEAR FROM leaves.start_date) = $1
//         AND EXTRACT(MONTH FROM leaves.start_date) = $2
//         ORDER BY leaves.start_date DESC;
//       `;
//       const values = [year, month];
//       const result = await pool.query(query, values);
//       const leaves = result.rows;
//       res.render("monthly_admin_leave_history", { userName: user.name, leaves, year, month });
//     } catch (error) {
//       console.error("Error fetching leave records:", error);
//       res.status(500).send("Internal Server Error");
//     }
//   } else {
//     res.redirect("/");
//   }
// });

app.post("/admin_leave_history", async (req, res) => {
  const user = req.session.user;
  const { year, month } = req.body;
  console.log("User session:", user);  // Debugging line

  if (user && user.role.trim().toLowerCase() === 'admin') {
    try {
      const query = `
        SELECT login.name, 
               to_char(leaves.start_date, 'YYYY-MM-DD') AS start_date, 
               to_char(leaves.end_date, 'YYYY-MM-DD') AS end_date, 
               leaves.reason, leaves.status
        FROM leaves
        JOIN login ON leaves.user_id = login.id
        WHERE EXTRACT(YEAR FROM leaves.start_date) = $1
        AND EXTRACT(MONTH FROM leaves.start_date) = $2
        ORDER BY leaves.start_date DESC;
      `;
      const values = [year, month];
      const result = await pool.query(query, values);
      const leaves = result.rows;
      res.render("monthly_admin_leave_history", { userName: user.name, leaves, year, month });
    } catch (error) {
      console.error("Error fetching leave records:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/");
  }
});

// app.get("/leave_history_admin", async (req, res) => {
//   const user = req.session.user;
//   console.log("User session:", user);  // Debugging line

//   if (user && user.role.trim().toLowerCase() === 'admin') {
//     try {
//       const query = `
//         SELECT login.id, login.name,
//                COALESCE(SUM(CASE WHEN leaves.status = 'Approved' THEN (leaves.end_date - leaves.start_date + 1) ELSE 0 END), 0) AS approved_leave_days,
//                COALESCE(SUM(CASE WHEN leaves.status = 'Rejected' THEN (leaves.end_date - leaves.start_date + 1) ELSE 0 END), 0) AS rejected_leave_days
//         FROM login
//         LEFT JOIN leaves ON login.id = leaves.user_id
//         WHERE login.role != 'admin'
//         GROUP BY login.id, login.name
//         ORDER BY login.name;
//       `;
//       const result = await pool.query(query);
//       const leaveSummary = result.rows;
//       res.render("leave_history_admin", { userName: user.name, leaveSummary });
//     } catch (error) {
//       console.error("Error fetching leave records:", error);
//       res.status(500).send("Internal Server Error");
//     }
//   } else {
//     res.redirect("/");
//   }
// });
// app.get("/leave_history_admin", async (req, res) => {
//   const user = req.session.user;
//   console.log("User session:", user);  // Debugging line

//   if (user && user.role.trim().toLowerCase() === 'admin') {
//     try {
//       const query = `
//         SELECT login.id, login.name,
//                COALESCE(SUM(CASE WHEN leaves.status = 'Approved' THEN (leaves.end_date - leaves.start_date + 1) ELSE 0 END), 0) AS approved_leave_days,
//                COALESCE(SUM(CASE WHEN leaves.status = 'Rejected' THEN (leaves.end_date - leaves.start_date + 1) ELSE 0 END), 0) AS rejected_leave_days,
//                (SELECT COUNT(*) FROM generate_series(
//                  date_trunc('month', CURRENT_DATE),
//                  date_trunc('month', CURRENT_DATE) + '1 month'::interval - '1 day'::interval,
//                  '1 day'::interval
//                ) g
//                WHERE EXTRACT(DOW FROM g) NOT IN (0, 6)) - 
//                COALESCE(SUM(CASE WHEN leaves.status = 'Approved' THEN (leaves.end_date - leaves.start_date + 1) ELSE 0 END), 0) -
//                COALESCE(SUM(CASE WHEN leaves.status = 'Rejected' THEN (leaves.end_date - leaves.start_date + 1) ELSE 0 END), 0) -
//                (SELECT COUNT(*) FROM record WHERE login.id = record.id AND date_trunc('month', record.date) = date_trunc('month', CURRENT_DATE)) AS absent_days
//         FROM login
//         LEFT JOIN leaves ON login.id = leaves.user_id
//         WHERE login.role != 'admin'
//         GROUP BY login.id, login.name
//         ORDER BY login.name;
//       `;
//       const result = await pool.query(query);
//       const leaveSummary = result.rows;
//       res.render("leave_history_admin", { userName: user.name, leaveSummary });
//     } catch (error) {
//       console.error("Error fetching leave records:", error);
//       res.status(500).send("Internal Server Error");
//     }
//   } else {
//     res.redirect("/");
//   }
// });
app.get("/leave_history_admin", async (req, res) => {
  const user = req.session.user;
  console.log("User session:", user);  // Debugging line

  if (user && user.role.trim().toLowerCase() === 'admin') {
    try {
      const query = `
        SELECT login.id, login.name,
               COALESCE(SUM(CASE WHEN leaves.status = 'Approved' THEN (leaves.end_date - leaves.start_date + 1) ELSE 0 END), 0) AS approved_leave_days,
               COALESCE(SUM(CASE WHEN leaves.status = 'Rejected' THEN (leaves.end_date - leaves.start_date + 1) ELSE 0 END), 0) AS rejected_leave_days,
               COALESCE(SUM(CASE WHEN leaves.status = 'absent' THEN (leaves.end_date - leaves.start_date + 1) ELSE 0 END), 0) AS absent_days
        FROM login
        LEFT JOIN leaves ON login.id = leaves.user_id
        WHERE login.role != 'admin'
        GROUP BY login.id, login.name
        ORDER BY login.name;
      `;
      const result = await pool.query(query);
      const leaveSummary = result.rows;
      res.render("leave_history_admin", { userName: user.name, leaveSummary });
    } catch (error) {
      console.error("Error fetching leave records:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/");
  }
});


app.post("/update_leave_status", async (req, res) => {
  const { leave_id, status } = req.body;

  try {
    const query = `
      UPDATE leaves
      SET status = $1
      WHERE leave_id = $2;
    `;
    const values = [status, leave_id];
    await pool.query(query, values);
    res.redirect("/review_leaves");
  } catch (error) {
    console.error("Error updating leave status:", error);
    res.status(500).send("Internal Server Error");
  }
});

//All Employee Monthly
app.get("/monthly_working_hours", async (req, res) => {
  user = req.session.user;
  //console.log(user)
  if (user) {
    res.render("monthly_working_hours", { userName: user.name });
  } else {
    res.redirect("/");
  }
});

// app.post('/monthly_working_hours', async (req, res) => {
//   const { name, year, month } = req.body;
//   const user = req.session.user;

//   // Find the user ID based on the provided name
//   let userId;
//   try {
//     const userQuery = `
//       SELECT id FROM login WHERE lower(name) LIKE lower($1);
//     `;
//     const userValues = [`%${name.trim()}%`];
//     const userResult = await pool.query(userQuery, userValues);

//     if (userResult.rows.length === 0) {
//       res.status(404).send("User not found.");
//       return;
//     }

//     userId = userResult.rows[0].id;
//   } catch (error) {
//     console.error("Error finding user ID:", error);
//     res.status(500).send("Internal Server Error");
//     return;
//   }

//   const daysInMonth = new Date(year, month, 0).getDate();

//   try {
//     const monthlyData = [];
//     let NAME = '';
//     let totalMonthlyMinutes = 0;
//     let totalMonthlyBreakMinutes = 0;
//     let totalMonthlyOfficeWorkMinutes = 0;
//     let totalMonthlyOtherMinutes = 0;

//     const shiftStartTime = new Date('1970-01-01T10:00:00Z');
//     const shiftEndTime = new Date('1970-01-01T19:00:00Z');

//     for (let day = 1; day <= daysInMonth; day++) {
//       const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

//       const query = `
//         SELECT name, check_in_time, check_out_time, reason, date
//         FROM record
//         WHERE (
//           lower(name) LIKE lower($1) OR
//           lower(name) LIKE lower($2) OR
//           lower(name) LIKE lower($3)
//         )
//         AND date = $4 AND id = $5
//         ORDER BY check_in_time;
//       `;
//       const values = [
//         `%${name.split(' ')[0]}%`, // First part of the name
//         `%${name.split(' ')[1]}%`, // Middle part of the name
//         `%${name.split(' ')[2]}%`, // Last part of the name
//         date,
//         userId
//       ];
//       const result = await pool.query(query, values);

//       if (result.rows.length > 0) {
//         let totalMinutes = 0;
//         let breakMinutes = 0;
//         let officeWorkMinutes = 0;
//         let otherMinutes = 0;
//         let isFirstCheckIn = true;  // Track the first check-in

//         for (let i = 0; i < result.rows.length; i++) {
//           const row = result.rows[i];
//           const checkInTime = row.check_in_time;
//           NAME = row.name;
//           const checkOutTime = row.check_out_time;
//           const reason = row.reason.trim().toLowerCase(); // Trim and lower case the reason

//           if (checkInTime) {
//             let checkInDateTime = new Date(`1970-01-01T${checkInTime}Z`);

//             // If this is the first check-in and it's after 10:00, add the difference to otherMinutes
//             if (isFirstCheckIn && checkInDateTime > shiftStartTime) {
//               const diffMs = checkInDateTime - shiftStartTime;
//               const diffMinutes = diffMs / 1000 / 60;
//               otherMinutes += diffMinutes;
//               isFirstCheckIn = false; // Mark the first check-in as processed
//             } else if (isFirstCheckIn) {
//               isFirstCheckIn = false; // Mark the first check-in as processed even if before 10:00
//             }

//             if (checkOutTime) {
//               const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
//               const diffMs = checkOutDateTime - checkInDateTime;
//               const diffMinutes = diffMs / 1000 / 60;

//               totalMinutes += diffMinutes;
//             }
//           }

//           if (checkOutTime && i < result.rows.length - 1) {
//             const nextRow = result.rows[i + 1];
//             const nextCheckInTime = nextRow.check_in_time;
//             if (nextCheckInTime) {
//               const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
//               const nextCheckInDateTime = new Date(`1970-01-01T${nextCheckInTime}Z`);
//               const diffMs = nextCheckInDateTime - checkOutDateTime;
//               const diffMinutes = diffMs / 1000 / 60;

//               if (reason === 'break') {
//                 breakMinutes += diffMinutes;
//               } else if (reason.includes('office')) { // Check if reason contains "office"
//                 officeWorkMinutes += diffMinutes;
//               } else {
//                 otherMinutes += diffMinutes;
//               }
//             }
//           } else if (checkOutTime && i === result.rows.length - 1) {
//             // If this is the last check-out and there's no subsequent check-in, count time until shift end
//             const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
//             if (checkOutDateTime < shiftEndTime) {
//               const diffMs = shiftEndTime - checkOutDateTime;
//               const diffMinutes = diffMs / 1000 / 60;

//               if (reason === 'break') {
//                 breakMinutes += diffMinutes;
//               } else if (reason.includes('office')) { // Check if reason contains "office"
//                 officeWorkMinutes += diffMinutes;
//               } else {
//                 otherMinutes += diffMinutes;
//               }
//             }
//           }
//         }

//         const totalHours = Math.floor(totalMinutes / 60);
//         const totalMinutesRemainder = totalMinutes % 60;

//         const breakHours = Math.floor(breakMinutes / 60);
//         const breakMinutesRemainder = breakMinutes % 60;

//         const officeWorkHours = Math.floor(officeWorkMinutes / 60);
//         const officeWorkMinutesRemainder = officeWorkMinutes % 60;

//         const otherHours = Math.floor(otherMinutes / 60);
//         const otherMinutesRemainder = otherMinutes % 60;

//         // Accumulate totals for the whole month
//         totalMonthlyMinutes += totalMinutes;
//         totalMonthlyBreakMinutes += breakMinutes;
//         totalMonthlyOfficeWorkMinutes += officeWorkMinutes;
//         totalMonthlyOtherMinutes += otherMinutes;

//         monthlyData.push({
//           NAME,
//           date,
//           totalHours,
//           totalMinutesRemainder,
//           breakHours,
//           breakMinutesRemainder,
//           officeWorkHours,
//           officeWorkMinutesRemainder,
//           otherHours,
//           otherMinutesRemainder
//         });
//       }
//     }

//     // Calculate total monthly hours and minutes
//     const totalMonthlyHours = Math.floor(totalMonthlyMinutes / 60);
//     const totalMonthlyMinutesRemainder = totalMonthlyMinutes % 60;

//     const totalMonthlyBreakHours = Math.floor(totalMonthlyBreakMinutes / 60);
//     const totalMonthlyBreakMinutesRemainder = totalMonthlyBreakMinutes % 60;

//     const totalMonthlyOfficeWorkHours = Math.floor(totalMonthlyOfficeWorkMinutes / 60);
//     const totalMonthlyOfficeWorkMinutesRemainder = totalMonthlyOfficeWorkMinutes % 60;

//     const totalMonthlyOtherHours = Math.floor(totalMonthlyOtherMinutes / 60);
//     const totalMonthlyOtherMinutesRemainder = totalMonthlyOtherMinutes % 60;

//     const months = [
//       'January', 'February', 'March', 'April', 'May', 'June',
//       'July', 'August', 'September', 'October', 'November', 'December'
//     ];

//     let monthname = '';
//     if (month >= 1 && month <= 12) {
//       monthname = months[month - 1]; // Months array is zero-based
//     } else {
//       throw new Error('Invalid month number');
//     }

//     console.log("Monthly Data:", monthlyData);
//     res.render('monthly_working_hours_report', { 
//       year, 
//       monthname, 
//       monthlyData,
//       totalMonthlyHours,
//       totalMonthlyMinutesRemainder,
//       totalMonthlyBreakHours,
//       totalMonthlyBreakMinutesRemainder,
//       totalMonthlyOfficeWorkHours,
//       totalMonthlyOfficeWorkMinutesRemainder,
//       totalMonthlyOtherHours,
//       totalMonthlyOtherMinutesRemainder
//     });
//   } catch (error) {
//     console.error("Error executing query:", error);
//     res.status(500).send("Internal Server Error");
//   }
// });
app.post('/monthly_working_hours', async (req, res) => {
  const { name, year, month } = req.body;
  const user = req.session.user;

  // Find the user ID based on the provided name
  let userId;
  try {
    const userQuery = `
      SELECT id FROM login WHERE lower(name) LIKE lower($1);
    `;
    const userValues = [`%${name.trim()}%`];
    const userResult = await pool.query(userQuery, userValues);

    if (userResult.rows.length === 0) {
      res.status(404).send("User not found.");
      return;
    }

    userId = userResult.rows[0].id;
  } catch (error) {
    console.error("Error finding user ID:", error);
    res.status(500).send("Internal Server Error");
    return;
  }

  const daysInMonth = new Date(year, month, 0).getDate();

  try {
    const monthlyData = [];
    let NAME = '';
    let totalMonthlyMinutes = 0;
    let totalMonthlyBreakMinutes = 0;
    let totalMonthlyOfficeWorkMinutes = 0;
    let totalMonthlyOtherMinutes = 0;

    const shiftStartTime = new Date('1970-01-01T10:00:00Z');
    const shiftEndTime = new Date('1970-01-01T19:00:00Z');

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

      const query = `
        SELECT name, check_in_time, check_out_time, reason, date
        FROM record
        WHERE (
          lower(name) LIKE lower($1) OR
          lower(name) LIKE lower($2) OR
          lower(name) LIKE lower($3)
        )
        AND date = $4 AND id = $5
        ORDER BY check_in_time;
      `;
      const values = [
        `%${name.split(' ')[0]}%`, // First part of the name
        `%${name.split(' ')[1]}%`, // Middle part of the name
        `%${name.split(' ')[2]}%`, // Last part of the name
        date,
        userId
      ];
      const result = await pool.query(query, values);

      if (result.rows.length > 0) {
        let totalMinutes = 0;
        let breakMinutes = 0;
        let officeWorkMinutes = 0;
        let otherMinutes = 0;
        let isFirstCheckIn = true;  // Track the first check-in

        for (let i = 0; i < result.rows.length; i++) {
          const row = result.rows[i];
          const checkInTime = row.check_in_time;
          NAME = row.name;
          const checkOutTime = row.check_out_time;
          const reason = row.reason.trim().toLowerCase(); // Trim and lower case the reason

          if (checkInTime) {
            let checkInDateTime = new Date(`1970-01-01T${checkInTime}Z`);

            // If this is the first check-in and it's after 10:00, add the difference to otherMinutes
            if (isFirstCheckIn && checkInDateTime > shiftStartTime) {
              const diffMs = checkInDateTime - shiftStartTime;
              const diffMinutes = diffMs / 1000 / 60;
              otherMinutes += diffMinutes;
              isFirstCheckIn = false; // Mark the first check-in as processed
            } else if (isFirstCheckIn) {
              isFirstCheckIn = false; // Mark the first check-in as processed even if before 10:00
            }

            if (checkOutTime) {
              const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
              const diffMs = checkOutDateTime - checkInDateTime;
              const diffMinutes = diffMs / 1000 / 60;

              totalMinutes += diffMinutes;
            } else if (i === result.rows.length - 1) {
              // If this is the last check-in and there's no subsequent check-out, count time until shift end
              const diffMs = shiftEndTime - checkInDateTime;
              const diffMinutes = diffMs / 1000 / 60;
              totalMinutes += diffMinutes;
            }
          }

          if (checkOutTime && i < result.rows.length - 1) {
            const nextRow = result.rows[i + 1];
            const nextCheckInTime = nextRow.check_in_time;
            if (nextCheckInTime) {
              const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
              const nextCheckInDateTime = new Date(`1970-01-01T${nextCheckInTime}Z`);
              const diffMs = nextCheckInDateTime - checkOutDateTime;
              const diffMinutes = diffMs / 1000 / 60;

              if (reason === 'break') {
                breakMinutes += diffMinutes;
              } else if (reason.includes('office')) { // Check if reason contains "office"
                officeWorkMinutes += diffMinutes;
              } else {
                otherMinutes += diffMinutes;
              }
            }
          } else if (checkOutTime && i === result.rows.length - 1) {
            // If this is the last check-out and there's no subsequent check-in, count time until shift end
            const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
            if (checkOutDateTime < shiftEndTime) {
              const diffMs = shiftEndTime - checkOutDateTime;
              const diffMinutes = diffMs / 1000 / 60;

              if (reason === 'break') {
                breakMinutes += diffMinutes;
              } else if (reason.includes('office')) { // Check if reason contains "office"
                officeWorkMinutes += diffMinutes;
              } else {
                otherMinutes += diffMinutes;
              }
            }
          }
        }

        const totalHours = Math.floor(totalMinutes / 60);
        const totalMinutesRemainder = totalMinutes % 60;

        const breakHours = Math.floor(breakMinutes / 60);
        const breakMinutesRemainder = breakMinutes % 60;

        const officeWorkHours = Math.floor(officeWorkMinutes / 60);
        const officeWorkMinutesRemainder = officeWorkMinutes % 60;

        const otherHours = Math.floor(otherMinutes / 60);
        const otherMinutesRemainder = otherMinutes % 60;

        // Accumulate totals for the whole month
        totalMonthlyMinutes += totalMinutes;
        totalMonthlyBreakMinutes += breakMinutes;
        totalMonthlyOfficeWorkMinutes += officeWorkMinutes;
        totalMonthlyOtherMinutes += otherMinutes;

        monthlyData.push({
          NAME,
          date,
          totalHours,
          totalMinutesRemainder,
          breakHours,
          breakMinutesRemainder,
          officeWorkHours,
          officeWorkMinutesRemainder,
          otherHours,
          otherMinutesRemainder
        });
      }
    }

    // Calculate total monthly hours and minutes
    const totalMonthlyHours = Math.floor(totalMonthlyMinutes / 60);
    const totalMonthlyMinutesRemainder = totalMonthlyMinutes % 60;

    const totalMonthlyBreakHours = Math.floor(totalMonthlyBreakMinutes / 60);
    const totalMonthlyBreakMinutesRemainder = totalMonthlyBreakMinutes % 60;

    const totalMonthlyOfficeWorkHours = Math.floor(totalMonthlyOfficeWorkMinutes / 60);
    const totalMonthlyOfficeWorkMinutesRemainder = totalMonthlyOfficeWorkMinutes % 60;

    const totalMonthlyOtherHours = Math.floor(totalMonthlyOtherMinutes / 60);
    const totalMonthlyOtherMinutesRemainder = totalMonthlyOtherMinutes % 60;

    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    let monthname = '';
    if (month >= 1 && month <= 12) {
      monthname = months[month - 1]; // Months array is zero-based
    } else {
      throw new Error('Invalid month number');
    }

    console.log("Monthly Data:", monthlyData);
    res.render('monthly_working_hours_report', { 
      year, 
      monthname, 
      monthlyData,
      totalMonthlyHours,
      totalMonthlyMinutesRemainder,
      totalMonthlyBreakHours,
      totalMonthlyBreakMinutesRemainder,
      totalMonthlyOfficeWorkHours,
      totalMonthlyOfficeWorkMinutesRemainder,
      totalMonthlyOtherHours,
      totalMonthlyOtherMinutesRemainder
    });
  } catch (error) {
    console.error("Error executing query:", error);
    res.status(500).send("Internal Server Error");
  }
});


app.get("/daily_working_hours", async (req, res) => {
  user = req.session.user;
  //console.log(user)
  if (user) {
    res.render("daily_working_hours", { userName: user.name });
  } else {
    res.redirect("/");
  }
});

// app.post('/daily_working_hours', async (req, res) => {
//   const { name, date } = req.body;
//   const user = req.session.user;

//   // Define the shift start time
//   const shiftStartTime = new Date('1970-01-01T10:00:00Z');
//   const shiftEndTime = new Date('1970-01-01T19:00:00Z');

//   // Find the user ID based on the provided name
//   let userId;
//   try {
//     const userQuery = `
//       SELECT id FROM login WHERE lower(name) LIKE lower($1);
//     `;
//     const userValues = [`%${name.trim()}%`];
//     const userResult = await pool.query(userQuery, userValues);

//     if (userResult.rows.length === 0) {
//       res.status(404).send("User not found.");
//       return;
//     }

//     userId = userResult.rows[0].id;
//   } catch (error) {
//     console.error("Error finding user ID:", error);
//     res.status(500).send("Internal Server Error");
//     return;
//   }

//   try {
//     const query = `
//       SELECT name, check_in_time, check_out_time, reason
//       FROM record
//       WHERE lower(name) LIKE lower($1)
//       AND date = $2 AND id = $3
//       ORDER BY check_in_time;
//     `;
//     const values = [
//       `%${name.split(' ')[0]}%`, // First part of the name
//       date,
//       userId
//     ];

//     console.log("Query:", query);
//     console.log("Values:", values);

//     const result = await pool.query(query, values);
//     console.log("Query Result:", result.rows);

//     if (result.rows.length === 0) {
//       res.status(404).send("No records found for the specified date.");
//       return;
//     }

//     let totalMinutes = 0;
//     let breakMinutes = 0;
//     let officeWorkMinutes = 0;
//     let otherMinutes = 0;
//     let NAME = '';
//     let isFirstCheckIn = true;  // Track the first check-in

//     for (let i = 0; i < result.rows.length; i++) {
//       const row = result.rows[i];
//       const checkInTime = row.check_in_time;
//       const checkOutTime = row.check_out_time;
//       NAME = row.name;
//       const reason = row.reason.trim().toLowerCase(); // Trim and lower case the reason

//       if (checkInTime) {
//         let checkInDateTime = new Date(`1970-01-01T${checkInTime}Z`);

//         // If this is the first check-in and it's after 10:00, add the difference to otherMinutes
//         if (isFirstCheckIn && checkInDateTime > shiftStartTime) {
//           const diffMs = checkInDateTime - shiftStartTime;
//           const diffMinutes = diffMs / 1000 / 60;
//           otherMinutes += diffMinutes;
//           isFirstCheckIn = false; // Mark the first check-in as processed
//         } else if (isFirstCheckIn) {
//           isFirstCheckIn = false; // Mark the first check-in as processed even if before 10:00
//         }

//         if (checkOutTime) {
//           const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
//           const diffMs = checkOutDateTime - checkInDateTime;
//           const diffMinutes = diffMs / 1000 / 60;

//           totalMinutes += diffMinutes;
//         }
//       }

//       if (checkOutTime && i < result.rows.length - 1) {
//         const nextRow = result.rows[i + 1];
//         const nextCheckInTime = nextRow.check_in_time;
//         if (nextCheckInTime) {
//           const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
//           const nextCheckInDateTime = new Date(`1970-01-01T${nextCheckInTime}Z`);
//           const diffMs = nextCheckInDateTime - checkOutDateTime;
//           const diffMinutes = diffMs / 1000 / 60;

//           console.log(`Reason: "${reason}", Diff Minutes: ${diffMinutes}`);

//           if (reason === 'break') {
//             breakMinutes += diffMinutes;
//             console.log("BREAK");
//           } else if (reason.includes('office')) { // Check if reason contains "office"
//             officeWorkMinutes += diffMinutes;
//             console.log("OFFICE WORK");
//           } else {
//             otherMinutes += diffMinutes;
//             console.log("OTHER");
//           }
//         }
//       } else if (checkOutTime && i === result.rows.length - 1) {
//         // If this is the last check-out and there's no subsequent check-in, count time until shift end
//         const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
//         if (checkOutDateTime < shiftEndTime) {
//           const diffMs = shiftEndTime - checkOutDateTime;
//           const diffMinutes = diffMs / 1000 / 60;

//           if (reason === 'break') {
//             breakMinutes += diffMinutes;
//             console.log("BREAK");
//           } else if (reason.includes('office')) { // Check if reason contains "office"
//             officeWorkMinutes += diffMinutes;
//             console.log("OFFICE WORK");
//           } else {
//             otherMinutes += diffMinutes;
//             console.log("OTHER");
//           }
//         }
//       }
//     }

//     const totalHours = Math.floor(totalMinutes / 60);
//     const totalMinutesRemainder = totalMinutes % 60;

//     const breakHours = Math.floor(breakMinutes / 60);
//     const breakMinutesRemainder = breakMinutes % 60;

//     const officeWorkHours = Math.floor(officeWorkMinutes / 60);
//     const officeWorkMinutesRemainder = officeWorkMinutes % 60;

//     const otherHours = Math.floor(otherMinutes / 60);
//     const otherMinutesRemainder = otherMinutes % 60;

//     res.render('daily_working_hours_report', {
//       NAME,
//       date,
//       totalHours,
//       totalMinutesRemainder,
//       breakHours,
//       breakMinutesRemainder,
//       officeWorkHours,
//       officeWorkMinutesRemainder,
//       otherHours,
//       otherMinutesRemainder
//     });
//   } catch (error) {
//     console.error("Error executing query:", error);
//     res.status(500).send("Internal Server Error");
//   }
// });
app.post('/daily_working_hours', async (req, res) => {
  const { name, date } = req.body;
  const user = req.session.user;

  // Define the shift start and end times
  const shiftStartTime = new Date('1970-01-01T10:00:00Z');
  const shiftEndTime = new Date('1970-01-01T19:00:00Z');

  // Find the user ID based on the provided name
  let userId;
  try {
    const userQuery = `
      SELECT id FROM login WHERE lower(name) LIKE lower($1);
    `;
    const userValues = [`%${name.trim()}%`];
    const userResult = await pool.query(userQuery, userValues);

    if (userResult.rows.length === 0) {
      res.status(404).send("User not found.");
      return;
    }

    userId = userResult.rows[0].id;
  } catch (error) {
    console.error("Error finding user ID:", error);
    res.status(500).send("Internal Server Error");
    return;
  }

  try {
    const query = `
      SELECT name, check_in_time, check_out_time, reason
      FROM record
      WHERE lower(name) LIKE lower($1)
      AND date = $2 AND id = $3
      ORDER BY check_in_time;
    `;
    const values = [
      `%${name.split(' ')[0]}%`, // First part of the name
      date,
      userId
    ];

    console.log("Query:", query);
    console.log("Values:", values);

    const result = await pool.query(query, values);
    console.log("Query Result:", result.rows);

    if (result.rows.length === 0) {
      res.status(404).send("No records found for the specified date.");
      return;
    }

    let totalMinutes = 0;
    let breakMinutes = 0;
    let officeWorkMinutes = 0;
    let otherMinutes = 0;
    let NAME = '';
    let isFirstCheckIn = true;  // Track the first check-in
    let lastCheckInTime = null; // Track the last check-in time

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      const checkInTime = row.check_in_time;
      const checkOutTime = row.check_out_time;
      NAME = row.name;
      const reason = row.reason.trim().toLowerCase(); // Trim and lower case the reason

      if (checkInTime) {
        let checkInDateTime = new Date(`1970-01-01T${checkInTime}Z`);
        lastCheckInTime = checkInDateTime;

        // If this is the first check-in and it's after 10:00, add the difference to otherMinutes
        if (isFirstCheckIn && checkInDateTime > shiftStartTime) {
          const diffMs = checkInDateTime - shiftStartTime;
          const diffMinutes = diffMs / 1000 / 60;
          otherMinutes += diffMinutes;
          isFirstCheckIn = false; // Mark the first check-in as processed
        } else if (isFirstCheckIn) {
          isFirstCheckIn = false; // Mark the first check-in as processed even if before 10:00
        }

        if (checkOutTime) {
          const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
          const diffMs = checkOutDateTime - checkInDateTime;
          const diffMinutes = diffMs / 1000 / 60;

          totalMinutes += diffMinutes;
        }
      }

      if (checkOutTime && i < result.rows.length - 1) {
        const nextRow = result.rows[i + 1];
        const nextCheckInTime = nextRow.check_in_time;
        if (nextCheckInTime) {
          const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
          const nextCheckInDateTime = new Date(`1970-01-01T${nextCheckInTime}Z`);
          const diffMs = nextCheckInDateTime - checkOutDateTime;
          const diffMinutes = diffMs / 1000 / 60;

          console.log(`Reason: "${reason}", Diff Minutes: ${diffMinutes}`);

          if (reason === 'break') {
            breakMinutes += diffMinutes;
            console.log("BREAK");
          } else if (reason.includes('office')) { // Check if reason contains "office"
            officeWorkMinutes += diffMinutes;
            console.log("OFFICE WORK");
          } else {
            otherMinutes += diffMinutes;
            console.log("OTHER");
          }
        }
      } else if (checkOutTime && i === result.rows.length - 1) {
        // If this is the last check-out and there's no subsequent check-in, count time until shift end
        const checkOutDateTime = new Date(`1970-01-01T${checkOutTime}Z`);
        if (checkOutDateTime < shiftEndTime) {
          const diffMs = shiftEndTime - checkOutDateTime;
          const diffMinutes = diffMs / 1000 / 60;

          if (reason === 'break') {
            breakMinutes += diffMinutes;
            console.log("BREAK");
          } else if (reason.includes('office')) { // Check if reason contains "office"
            officeWorkMinutes += diffMinutes;
            console.log("OFFICE WORK");
          } else {
            otherMinutes += diffMinutes;
            console.log("OTHER");
          }
        }
      }
    }

    // If there's no check-out after the last check-in, count time until shift end
    if (lastCheckInTime) {
      const diffMs = shiftEndTime - lastCheckInTime;
      const diffMinutes = diffMs / 1000 / 60;
      totalMinutes += diffMinutes;
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const totalMinutesRemainder = totalMinutes % 60;

    const breakHours = Math.floor(breakMinutes / 60);
    const breakMinutesRemainder = breakMinutes % 60;

    const officeWorkHours = Math.floor(officeWorkMinutes / 60);
    const officeWorkMinutesRemainder = officeWorkMinutes % 60;

    const otherHours = Math.floor(otherMinutes / 60);
    const otherMinutesRemainder = otherMinutes % 60;

    res.render('daily_working_hours_report', {
      NAME,
      date,
      totalHours,
      totalMinutesRemainder,
      breakHours,
      breakMinutesRemainder,
      officeWorkHours,
      officeWorkMinutesRemainder,
      otherHours,
      otherMinutesRemainder
    });
  } catch (error) {
    console.error("Error executing query:", error);
    res.status(500).send("Internal Server Error");
  }
});




app.get("/check_in", async (req, res) => {
  user = req.session.user;
  console.log(user)
  if (user) {
    res.render("check_in", { userName: user.name });
  } else {
    res.redirect("/");
  }
});

app.post('/check_in', async (req, res) => {
  const { name, date, location, time } = req.body;
  const user = req.session.user;
  const loginId = user.id;
  const type = 'IN';
  const reason = ''; // Set a reason if needed

  try {
    // Convert check-in time to a Date object
    const checkInTime = new Date(`1970-01-01T${time}Z`);
    const cutoffTime = new Date('1970-01-01T19:00:00Z');

    // Check if the check-in time is after 19:00
    if (checkInTime > cutoffTime) {
      res.status(400).send("Cannot check in after 19:00.");
      return;
    }

    // Check if the user has any unchecked-out record for the given date
    const checkQuery = `
      SELECT id FROM record
      WHERE name = $1 AND date = $2 AND id = $3 AND check_out_time IS NULL
      LIMIT 1;
    `;
    const checkValues = [name, date, loginId];

    const checkResult = await pool.query(checkQuery, checkValues);

    if (checkResult.rows.length > 0) {
      res.status(400).send("Cannot check in. You have an existing session that hasn't been checked out.");
      return;
    }

    // Insert the check-in time into the record table
    const insertQuery = `
      INSERT INTO record(name, check_in_time, date, id, type, reason, location)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    const insertValues = [name, time, date, loginId, type, reason, location];

    await pool.query(insertQuery, insertValues);
    res.render("dashboard");
  } catch (error) {
    console.error("Error executing check-in query:", error);
    res.status(500).send("Internal Server Error");
  }
});

// app.post('/check_in', async (req, res) => {
//   const { name, date, location, time } = req.body;
//   const user = req.session.user;
//   const loginId = user.id;
//   const type = 'IN';
//   const reason = ''; // Set a reason if needed

//   try {
//     // Convert check-in time to a Date object
//     const checkInTime = new Date(`1970-01-01T${time}Z`);
//     const cutoffTime = new Date('1970-01-01T19:00:00Z');

//     // Check if the check-in time is after 19:00
//     if (checkInTime > cutoffTime) {
//       res.status(400).send("Cannot check in after 19:00.");
//       return;
//     }

//     // Check if the user has any unchecked-out record for the current date
//     const checkQuery = `
//       SELECT id, date FROM record
//       WHERE name = $1 AND id = $2 AND check_out_time IS NULL
//       ORDER BY date DESC
//       LIMIT 1;
//     `;
//     const checkValues = [name, loginId];
//     const checkResult = await pool.query(checkQuery, checkValues);

//     if (checkResult.rows.length > 0) {
//       const lastCheckInDate = new Date(checkResult.rows[0].date);
//       const currentDate = new Date(date);

//       // Check if the last check-in was on the previous date
//       if (lastCheckInDate.getDate() === currentDate.getDate() - 1) {
//         // Allow check-in if the last check-in was on the previous date
//         const insertQuery = `
//           INSERT INTO record(name, check_in_time, date, id, type, reason, location)
//           VALUES ($1, $2, $3, $4, $5, $6, $7)
//         `;
//         const insertValues = [name, time, date, loginId, type, reason, location];
//         await pool.query(insertQuery, insertValues);
//         res.render("dashboard");
//       } else {
//         res.status(400).send("Cannot check in. You have an existing session that hasn't been checked out.");
//         return;
//       }
//     } else {
//       // Insert the check-in time into the record table if there is no previous record
//       const insertQuery = `
//         INSERT INTO record(name, check_in_time, date, id, type, reason, location)
//         VALUES ($1, $2, $3, $4, $5, $6, $7)
//       `;
//       const insertValues = [name, time, date, loginId, type, reason, location];
//       await pool.query(insertQuery, insertValues);
//       res.render("dashboard");
//     }
//   } catch (error) {
//     console.error("Error executing check-in query:", error);
//     res.status(500).send("Internal Server Error");
//   }
// });


app.get("/check_out", async (req, res) => {
  user = req.session.user;
  //console.log(user)
  if (user) {
    res.render("check_out", { userName: user.name });
  } else {
    res.redirect("/");
  }
});

app.post('/check_out', async (req, res) => {
  const user = req.session.user;
  const loginId = user.id;
  const { name, time, date, reason } = req.body;
  console.log("Time:", time);
  console.log("Reason:", reason);
  
  try {
    const [hours, minutes, seconds] = time.split(':');
    const formattedTime = `${hours}:${minutes}:${seconds}`;
    console.log("Formatted Time:", formattedTime);
    
    // Adjust time if it's greater than 19:00
    let adjustedTime = formattedTime;
    if (parseInt(hours) > 19 || (parseInt(hours) === 19 && parseInt(minutes) > 0)) {
      adjustedTime = '19:00:00';
    }
    console.log("Adjusted Time:", adjustedTime);
    
    const selectQuery = `
      SELECT id FROM record
      WHERE name = $1 AND date = $2 AND id = $3 AND check_out_time IS NULL
      LIMIT 1;
    `;
    const selectValues = [name, date, loginId];
    
    const selectResult = await pool.query(selectQuery, selectValues);

    if (selectResult.rows.length === 0) {
      res.status(400).send("Check-in record not found or already checked out.");
      return;
    }

    // Update query to set the check-out time and reason
    const updateQuery = `
      UPDATE record
      SET check_out_time = $1, reason = $2
      WHERE id = $3 AND date = $4 AND check_out_time IS NULL;
    `;
    console.log("Change Time:",adjustedTime)
    const updateValues = [adjustedTime, reason, loginId, date];

    await pool.query(updateQuery, updateValues);

    res.render("dashboard");
  } catch (error) {
    console.error("Error executing check-out query:", error);
    res.status(500).send("Internal Server Error");
  }
});


app.get("/add_employee", async (req, res) => {
  user = req.session.user;
  console.log("User is:",user)
  if (user) {
    res.render("add_employee");
  } else {
    res.redirect("/");
  }
});

app.post('/add_employee', async (req, res) => {
  user = req.session.user;
  console.log(user)
  
  let login_id = 0;
  login_id = user.id;
  const {name,role, email,password } = req.body;
  
  try {
    const insertQuery =
      "INSERT INTO login(name,role,password,email) VALUES ($1, $2, $3, $4)";
    const insertValues = [
      name,
      role,
      password,
      email,
    ];

    await pool.query(insertQuery, insertValues);
    res.render("admin_dashboard");
  } catch (error) {
    console.error("Error executing query", error);
    res.status(500).send("Internal Server Error");
  }
});


app.get("/daily_report", async (req, res) => {
  user = req.session.user;
  console.log(user)
  if (user) {
    res.render("daily_report");
  } else {
    res.redirect("/");
  }
});
app.post('/daily_report', async (req, res) => {
  const user = req.session.user;
  const { name, date } = req.body;
  console.log("Date:", date);
  let day='2024-04-16'
  async function generateUserReportByNameAndMonth(name, year, month) {
    try {
      const query = `
        SELECT name, check_in_time, check_out_time, date,reason, location
        FROM record
        WHERE (
          lower(name) LIKE lower($1) OR
          lower(name) LIKE lower($2) OR
          lower(name) LIKE lower($3)
        )
        AND date::date= $4::date
        ORDER BY date, check_in_time;
      `;
  
      const values = [
        `%${name.split(' ')[0]}%`, // First part of the name
        `%${name.split(' ')[1]}%`, // Middle part of the name
        `%${name.split(' ')[2]}%`, // Last part of the name
          date
      ]; // Use % for wildcard matching

      const result = await pool.query(query, values);
  
      return result.rows; // Return the rows from the query result
    } catch (error) {
      console.error('Error generating user report:', error);
      throw error; // Throw the error for handling in the caller function
    }
  }
  try {
    const reportData = await generateUserReportByNameAndMonth(name,date);

    reportData.forEach((record) => {
      record.date = new Date(record.date).toDateString().slice(0, 10);
    });

    
    
    res.render('oneday_report', { user, reportData,date });
  } catch (error) {
    console.error('Error generating user report:', error);
    res.status(500).send('Error generating user report');
  }
});

// // // Report route

app.get("/report", async (req, res) => {
  user = req.session.user;
  console.log(user)
  if (user) {
    res.render("report");
  } else {
    res.redirect("/");
  }
});

app.post('/report', async (req, res) => {
  const user = req.session.user;
  const { name, year, month } = req.body;

  async function generateUserReportByNameAndMonth(name, year, month) {
    try {
      const query = `
        SELECT name, check_in_time, check_out_time, date, type, reason, location
        FROM record
        WHERE (
          lower(name) LIKE lower($1) OR
          lower(name) LIKE lower($2) OR
          lower(name) LIKE lower($3)
        )
        AND EXTRACT(YEAR FROM date) = $4
        AND EXTRACT(MONTH FROM date) = $5
        ORDER BY date, check_in_time;
      `;
  
      const values = [
        `%${name.split(' ')[0]}%`, // First part of the name
        `%${name.split(' ')[1]}%`, // Middle part of the name
        `%${name.split(' ')[2]}%`, // Last part of the name
        year,
        month
      ]; // Use % for wildcard matching

      const result = await pool.query(query, values);
  
      return result.rows; // Return the rows from the query result
    } catch (error) {
      console.error('Error generating user report:', error);
      throw error; // Throw the error for handling in the caller function
    }
  }

  try {
    const reportData = await generateUserReportByNameAndMonth(name, year, month);

    reportData.forEach((record) => {
      record.date = new Date(record.date).toDateString().slice(0, 10);
    });

    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
  
    let monthname = '';
    if (month >= 1 && month <= 12) {
      monthname = months[month - 1]; // Months array is zero-based
    } else {
      throw new Error('Invalid month number');
    }
    
    res.render('attendance_report', { user, reportData, monthname, year });
  } catch (error) {
    console.error('Error generating user report:', error);
    res.status(500).send('Error generating user report');
  }
});

app.get("/logout", (req, res) => {
  req.session.user = null;
  res.redirect("/");
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// CREATE TABLE record
// (
//     r_id serial PRIMARY KEY,
//     name varchar(50) COLLATE pg_catalog."default",
//     "time" time without time zone,
//     date date,
//     type varchar(3) COLLATE pg_catalog."default",
//     id integer NOT NULL,
//     reason varchar(50) COLLATE pg_catalog."default",
//     location varchar(1000) COLLATE pg_catalog."default",
//     CONSTRAINT fk_login_id FOREIGN KEY (id)
//         REFERENCES public.login (id)
//         ON UPDATE NO ACTION
//         ON DELETE NO ACTION
// );



