const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
app.use(express.json());
const jsonMiddleware = express.json();
app.use(jsonMiddleware);
let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const convertStateObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDbObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

//Authenticate Token
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(
      jwtToken,
      "",
      async(error, (payload) => {
        if (error) {
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      })
    );
  }
};

//API 1 POST
app.post("/login/", authenticateToken, async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT * FROM user
    WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API2 GET
app.get("/states/", async (request, response) => {
  const getStateQuery = `
    SELECT state_id,state_name,population 
    FROM state;`;
  const stateArray = await db.all(getStateQuery);
  response.send(
    stateArray.map((eachState) => ({
      stateId: eachState.state_id,
      sateName: eachState.state_name,
      population: eachState.population,
    }))
  );
});

//API3 GET
app.get("/states/:stateId/", async (request, response) => {
  const { stateId } = request.params;
  const getEachQuery = `
  SELECT 
    * 
  FROM
    state
  WHERE 
    state_id = ${stateId};`;
  const state = await db.get(getEachQuery);
  response.send(convertStateObject(state));
});

//API4 POST
app.post("/districts/", async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const postQuery = `
  INSERT INTO
  district(district_name, state_id, cases, cured, active, deaths)
  VALUES
  ('${districtName}',${stateId},${cases},${cured},${active},${deaths});`;
  await db.run(postQuery);
  response.send("District Successfully added");
});

//API5 GET
app.get("/districts/:districtId/", async (request, response) => {
  const { districtId } = request.params;
  const getQuery = `
  SELECT * FROM district
  WHERE district_id=${districtId};`;
  const district = await db.get(getQuery);
  response.send(convertDistrictDbObject(district));
});

//API6 DELETE

app.delete("/districts/:districtId/", async (request, response) => {
  const { districtId } = request.params;
  let jwtToken;
  const deleteQuery = `
    DELETE FROM district
    WHERE district_id = ${districtId};`;
  await db.run(deleteQuery);
  response.send("District Removed");
});

//API7 PUT
app.put("/districts/:districtId/", async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const { districtId } = request.params;
  const updateQuery = `
  UPDATE district
  SET
  district_name='${districtName}',
  state_id=${stateId},
  cases=${cases},
  cured=${cured},
  active=${active},
  deaths=${deaths}
  WHERE district_id=${districtId};`;
  await db.run(updateQuery);
  response.send("District Details Updated");
});

//API8 GET
app.get("/states/:stateId/stats/", async (request, response) => {
  const { stateId } = request.params;
  const getTotal = `
    SELECT 
      SUM(cases),
      SUM(cured),
      SUM(active),
      SUM(deaths)
    FROM district
    WHERE state_id=${stateId};`;
  const total = await db.get(getTotal);
  response.send({
    totalCases: total["SUM(cases)"],
    totalCured: total["SUM(cured)"],
    totalActive: total["SUM(active)"],
    totalDeaths: total["SUM(deaths)"],
  });
});

module.exports = app;
