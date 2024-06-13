const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const session = require("express-session");
const app = express();
const PORT = 9000;
const pgp = require("pg-promise")();
const path = require('path');
require('dotenv').config();
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});
app.set('views', path.join(__dirname, 'views'));
app.set("view engine", "pug");
app.use(express.static(path.join(__dirname, 'public')));

app.use("/static", express.static("static"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: "my-secret",
    resave: false,
    saveUninitialized: true,
  })
);

app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  user = req.session.user;
  
  if (user) {
    res.redirect('/')
    
    if ((user.role.toLowerCase().trim() === "web developer")||(user.role.toLowerCase().trim() === "Content Writer")) {
      req.session.user = user;
      let userId = user.id;
      

      res.render("dashboard", { user: user });
    } else if (user.role.toLowerCase().trim() === "Content Writer") {
      req.session.user = user;
      res.render("dashboard", { user: user });
    } else if (user.role.toLowerCase().trim() === "audit") {
      req.session.user = user;
      res.render("audit_dashboard", { user: user });
    } else {
      res.redirect("signup");
    }
  } else {
    res.render("login");
  }
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
      if (user.role.toLowerCase().trim() === "developer") {
        req.session.user = user;
        let userId = user.id;

        res.render("admin_dashboard", { user: user });
      } else if (user.role.toLowerCase().trim() === "content writer") {
        req.session.user = user;
        res.render("dashboard", { user: user });
      } else if (user.role.toLowerCase().trim() === "ai") {
        req.session.user = user;
        res.render("dashboard", { user: user });
      } else {
        res.redirect("signup");
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
//monthly
app.get("/monthly_working_hours", async (req, res) => {
  user = req.session.user;
  //console.log(user)
  if (user) {
    res.render("monthly_working_hours", { userName: user.name });
  } else {
    res.redirect("/");
  }
});

app.post('/monthly_working_hours', async (req, res) => {
  const { name, year, month } = req.body;
  const user = req.session.user;
  const loginId = user.id;

  const daysInMonth = new Date(year, month, 0).getDate();
  
  try {
    const monthlyData = [];
    let NAME='';

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

      const query = `
        SELECT name,check_in_time, check_out_time, reason,date
        FROM record
        WHERE (
          lower(name) LIKE lower($1) OR
          lower(name) LIKE lower($2) OR
          lower(name) LIKE lower($3)
        )
        AND date = $4 AND id = $5
        ORDER BY check_in_time;
      `;
      // const values = [name, date, loginId];
      const values = [
        `%${name.split(' ')[0]}%`, // First part of the name
        `%${name.split(' ')[1]}%`, // Middle part of the name
        `%${name.split(' ')[2]}%`, // Last part of the name
        date,
        loginId
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
          NAME=row.name;
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
    res.render('monthly_working_hours_report', {year, monthname, monthlyData});
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

app.post('/daily_working_hours', async (req, res) => {
  const { name, date } = req.body;
  const user = req.session.user;
  const loginId = user.id;

  try {
    const query = `
      SELECT check_in_time, check_out_time, reason
      FROM record
      WHERE name = $1 AND date = $2 AND id = $3
      ORDER BY check_in_time;
    `;
    const values = [name, date, loginId];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      res.status(404).send("No records found for the specified date.");
      return;
    }

    let totalMinutes = 0;
    let breakMinutes = 0;
    let officeWorkMinutes = 0;
    let otherMinutes = 0;

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      const checkInTime = row.check_in_time;
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

          console.log(`Reason: "${reason}", Diff Minutes: ${diffMinutes}`);

          if (reason === 'break') {
            breakMinutes += diffMinutes;
            console.log("BREAK")
          } else if (reason.includes('office')) { // Check if reason contains "office"
            officeWorkMinutes += diffMinutes;
            console.log("OFFICE WORK")
          } else {
            otherMinutes += diffMinutes;
            console.log("OTHER")
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

    res.render('daily_working_hours_report', { 
      name, 
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
    res.render("admin_dashboard");
  } catch (error) {
    console.error("Error executing check-in query:", error);
    res.status(500).send("Internal Server Error");
  }
});

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
    console.log("Change Time:",formattedTime)
    const updateValues = [time, reason, loginId, date];

    await pool.query(updateQuery, updateValues);

    res.render("admin_dashboard");
  } catch (error) {
    console.error("Error executing check-out query:", error);
    res.status(500).send("Internal Server Error");
  }
});

////Add Employee
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
  // console.log(user.id)
  // console.log(user.email)
  //console.log("POst")
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


app.get("/report", async (req, res) => {
  user = req.session.user;
  console.log(user)
  if (user) {
    res.render("report");
  } else {
    res.redirect("/");
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



