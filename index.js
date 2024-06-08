const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const session = require("express-session");
const app = express();
const PORT = 9000;
const pgp = require("pg-promise")();

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "AMS",
  password: "8292",
  port: 5432,
});

app.set('views', path.join(__dirname, 'views'));
app.set("view engine", "pug");
app.use(express.static("public"));
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
app.get('/login', (req, res) => {
    res.render('login');
  });
// app.get("/", (req, res) => {
//   user = req.session.user;
  
//   if (user) {
//     res.redirect('/')
    
//     if ((user.role.toLowerCase().trim() === "web developer")||(user.role.toLowerCase().trim() === "Content Writer")) {
//       req.session.user = user;
//       let userId = user.id;
      

//       res.render("dashboard", { user: user });
//     } else if (user.role.toLowerCase().trim() === "Content Writer") {
//       req.session.user = user;
//       res.render("dashboard", { user: user });
//     } else if (user.role.toLowerCase().trim() === "audit") {
//       req.session.user = user;
//       res.render("audit_dashboard", { user: user });
//     } else {
//       res.redirect("signup");
//     }
//   } else {
//     res.render("login");
//   }
// });


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
      if (user.role.toLowerCase().trim() === "web developer") {
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
app.get("/check_in", async (req, res) => {
  user = req.session.user;
  //console.log(user)
  if (user) {
    res.render("check_in", { userName: user.name });
  } else {
    res.redirect("/");
  }
});
app.post('/check_in', async (req, res) => {
  user = req.session.user;
  //console.log(user)
  // console.log(user.id)
  // console.log(user.email)
  //console.log("POst")
  let login_id = 0;
  login_id = user.id;
  let type="IN";
  let reason=''
  const {name, time, date,location } = req.body;
  // console.log(name);
  // console.log(time)
    console.log("Location is:",location)
  try {
    const insertQuery =
      "INSERT INTO record(name,time,date,id,type,reason,location) VALUES ($1, $2, $3, $4,$5,$6,$7)";
    const insertValues = [
      name,
      time,
      date,
      login_id,
      type,
      reason,
      location,
    ];

    await pool.query(insertQuery, insertValues);
    res.render("dashboard");
  } catch (error) {
    console.error("Error executing query", error);
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
  user = req.session.user;
  console.log(user)
  // console.log(user.id)
  // console.log(user.email)
  //console.log("POst")
  let login_id = 0;
  login_id = user.id;
  let type="OUT";
  const {name, time, date,reason } = req.body;
  console.log(name);
  console.log(time)
  console.log(date)
  try {
    const insertQuery =
      "INSERT INTO record(name,time,date,id,type,reason) VALUES ($1, $2, $3, $4,$5,$6)";
    const insertValues = [
      name,
      time,
      date,
      login_id,
      type,
      reason,
    ];

    await pool.query(insertQuery, insertValues);
    res.render("dashboard");
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
  async function generateUserReportByNameAndMonth(name,date) {
    try {
      const query = `
        SELECT name, time, date, type, reason
        FROM record
        WHERE (
          lower(name) LIKE lower($1) OR
          lower(name) LIKE lower($2) OR
          lower(name) LIKE lower($3)
        )
        AND date::date = $4::date
        ORDER BY time;
      `;
  
      const values = [
        `%${name.split(' ')[0]}%`, // First part of the name
        `%${name.split(' ')[1]}%`, // Middle part of the name
        `%${name.split(' ')[2]}%`, // Last part of the name
        date
      ];

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

    // const months = [
    //   'January', 'February', 'March', 'April', 'May', 'June',
    //   'July', 'August', 'September', 'October', 'November', 'December'
    // ];
  
    // let monthname = '';
    // if (month >= 1 && month <= 12) {
    //   monthname = months[month - 1]; // Months array is zero-based
    // } else {
    //   throw new Error('Invalid month number');
    // }
    
    res.render('oneday_report', { user, reportData,date });
  } catch (error) {
    console.error('Error generating user report:', error);
    res.status(500).send('Error generating user report');
  }
});


app.post('/report', async (req, res) => {
  const user = req.session.user;
  const { name, year, month } = req.body;

  async function generateUserReportByNameAndMonth(name, year, month) {
    try {
      const query = `
        SELECT name, time, date, type, reason, location
        FROM record
        WHERE (
          lower(name) LIKE lower($1) OR
          lower(name) LIKE lower($2) OR
          lower(name) LIKE lower($3)
        )
        AND EXTRACT(YEAR FROM date) = $4
        AND EXTRACT(MONTH FROM date) = $5
        ORDER BY time;
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
