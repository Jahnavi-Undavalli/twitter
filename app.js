const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
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

const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  const jwtToken = authHeader.split(" ")[1];
  const secretKey = "my_secret_key";
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, secretKey, async (err, payload) => {
      if (err) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.user = payload;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserStatus = `select * from user where username = '${username}';`;
  const dbRes = await database.get(checkUserStatus);
  if (dbRes === undefined) {
    if (password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createNewUser = `insert into user (username,password,name,gender)
    values('${username}','${hashedPassword}','${name}','${gender}');`;
      await database.run(createNewUser);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);
  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
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

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  // get user id
  const { username } = request.user;
  const getUser_id = `select * from user where username = '${username}' ;`;
  const dbRes = await database.get(getUser_id);
  const userId = dbRes.user_id;

  //get follower ids
  const getUserTweetsQuery = `select * from user inner join follower on user.user_id = follower.follower_user_id where user_id ='${userId}'`;
  const follower = await database.all(getUserTweetsQuery);
  const getFollowerIdArray = follower.map((e) => e.following_user_id);

  //get tweets
  const getTweetsQuery = `select username,tweet,date_time as dateTime from tweet inner join user on tweet.user_id = user.user_id where tweet.user_id in (${getFollowerIdArray}) order by date_time desc limit 4`;
  const getTweets = await database.all(getTweetsQuery);
  response.send(getTweets);
});

/// API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request.user;
  //get user_id
  const getUserId = `select user_id from user where username = '${username}';`;
  const userId = await database.get(getUserId);

  //get following ids
  const getFollowerIdQuery = `select following_user_id from follower where follower_user_id = '${userId.user_id}';`;
  const followerId = await database.all(getFollowerIdQuery);
  const followingIdArray = followerId.map((e) => e.following_user_id);

  //get following names
  const getNameQuery = `select name from user where user_id in (${followingIdArray});`;
  const name = await database.all(getNameQuery);

  response.send(name);
});

// API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request.user;
  //get user_id
  const getUserId = `select user_id from user where username = '${username}';`;
  const userId = await database.get(getUserId);

  // get follower names

  const followerUserIdQuery = `select follower_user_id from follower where following_user_id = ${userId.user_id};`;
  const dbResponse = await database.all(followerUserIdQuery);
  const followerIds = dbResponse.map((e) => e.follower_user_id);

  // get follower names

  const getFollowerNames = `select name from user where user_id in (${followerIds})`;
  const getNames = await database.all(getFollowerNames);
  response.send(getNames);
});

// API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request.user;
  const { tweetId } = request.params;
  //get user_id
  const getUserId = `select user_id from user where username = '${username}';`;
  const userId = await database.get(getUserId);

  //get following ids
  const getFollowerIdQuery = `select following_user_id from follower where follower_user_id = '${userId.user_id}';`;
  const followerId = await database.all(getFollowerIdQuery);
  const followingIdArray = followerId.map((e) => e.following_user_id);

  //get tweets of followers

  const getTweetsQuery = `select tweet,
  (select count(like_id) as likes from like where like.tweet_id =${tweetId}) as likes,
  (select count(reply_id) as replies from reply where reply.tweet_id =${tweetId}) as replies,
  date_time as dateTime
  from tweet where tweet.user_id in (${followingIdArray}) and tweet_id=${tweetId}`;
  const res = await database.all(getTweetsQuery);
  if (res[0] !== undefined) {
    response.send(res[0]);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request.user;
    const { tweetId } = request.params;
    //get user_id
    const getUserId = `select user_id from user where username = '${username}';`;
    const userId = await database.get(getUserId);

    //get following ids
    const getFollowerIdQuery = `select following_user_id from follower where follower_user_id = '${userId.user_id}';`;
    const followerId = await database.all(getFollowerIdQuery);
    const followingIdArray = followerId.map((e) => e.following_user_id);

    // get liked names
    const getLikesNamesQuery = `select 
    (select username from user where user_id = like.user_id ) as username 
    from like 
    where user_id in (${followingIdArray}) and tweet_id =${tweetId}`;
    const res = await database.all(getLikesNamesQuery);
    if (res.length !== 0) {
      response.send({ likes: res.map((e) => e.username) });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

/// API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request.user;
    const { tweetId } = request.params;
    //get user_id
    const getUserId = `select user_id from user where username = '${username}';`;
    const userId = await database.get(getUserId);

    //get following ids
    const getFollowerIdQuery = `select following_user_id from follower where follower_user_id = '${userId.user_id}';`;
    const followerId = await database.all(getFollowerIdQuery);
    const followingIdArray = followerId.map((e) => e.following_user_id);

    // get liked names
    const getReplyNamesQuery = `select name,reply from tweet inner join reply on tweet.tweet_id = reply.tweet_id inner join user on user.user_id = tweet.user_id where tweet.user_id in(${followingIdArray}) and tweet.tweet_id=${tweetId};`;
    const getReply = await database.all(getReplyNamesQuery);
    if (getReply[0] !== undefined) {
      response.send({ replies: getReply });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request.user;
  const getUserIdQuery = `select user_id from user where username='${username}'`;
  const userId = await database.get(getUserIdQuery);

  //get user tweets

  const getUserTweetsQuery = `SELECT tweet,(select count(like_id) from like where tweet.tweet_id) as likes,
  (select count(reply_id) from reply where tweet.tweet_id) as replies,date_time as dateTime from tweet where user_id=${userId.user_id} `;
  const res = await database.all(getUserTweetsQuery);
  response.send(res);
});

/// API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request.user;

  const getUserIdQuery = `select user_id from user where username='${username}'`;
  const userId = await database.get(getUserIdQuery);
  const dateTime = new Date();

  //post tweet
  const { tweet } = request.body;
  const postSqlQuery = `insert into tweet (tweet,user_id,date_time) values('${tweet}','${userId.user_id}','${dateTime}')`;
  await database.run(postSqlQuery);
  response.send("Created a Tweet");
});

/// API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request.user;
    const { tweetId } = request.params;

    const getUserIdQuery = `select user_id from user where username='${username}'`;
    const userId = await database.get(getUserIdQuery);

    const getUseTweetIds = `select tweet_id from tweet where tweet.user_id = ${userId.user_id}`;
    const tweetIds = await database.all(getUseTweetIds);

    /// delete

    if (tweetIds.some((e) => e.tweet_id === parseInt(tweetId))) {
      const deleteQuery = `delete from tweet where tweet_id = ${parseInt(
        tweetId
      )}`;
      await database.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
