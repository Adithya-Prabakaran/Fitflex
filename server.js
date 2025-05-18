const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const User = require('./models/User');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

function requireLogin(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return next();
  } else {
    res.redirect('/login');
  }
}

mongoose.connect('mongodb://127.0.0.1:27017/authentication', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB authentication database'))
  .catch(err => console.error('Connection error:', err));

const bmiConnection = mongoose.createConnection('mongodb://127.0.0.1:27017/bmi_dbs', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

bmiConnection.once('open', () => {
  console.log('Connected to MongoDB BMI database');
});

bmiConnection.on('error', (err) => {
  console.error('BMI DB Connection error:', err);
});

const bmiSchema = require('./models/BMI').schema;
const BMI = bmiConnection.model('BMI', bmiSchema, 'bmi');

const energyConnection = mongoose.createConnection('mongodb://127.0.0.1:27017/energy', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const calorieSchema = require('./models/calorie').schema;
const Calorie = energyConnection.model('Calorie', calorieSchema, 'calories');

energyConnection.once('open', () => {
  console.log('Connected to MongoDB Energy database');
});


app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'signup_page.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login_page.html'));
});

app.get('/edit_profile', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'edit_profile.html'));
});

app.get('/calorie-tracker', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'calorie-tracker.html'));
});

const foodConnection = mongoose.createConnection('mongodb://127.0.0.1:27017/food', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

let FoodModel = null;
let isFoodDBReady = false;

foodConnection.once('open', () => {
  console.log('Connected to MongoDB food database');
  // Use a flexible schema (accepts any shape)
  FoodModel = foodConnection.model('FoodItem', new mongoose.Schema({}, { strict: false }));
  isFoodDBReady = true;
});

foodConnection.on('error', err => {
  console.error('MongoDB food database error:', err);
});

// API endpoint to get all food items
app.get('/api/fooditems', async (req, res) => {
  if (!isFoodDBReady) {
    return res.status(503).json({ error: 'Food database initializing' });
  }
  try {
    const items = await FoodModel.find({}).lean();
    res.json(items);
  } catch (err) {
    console.error('DB Query Error:', err);
    res.status(500).json({ error: 'Failed to fetch food items' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Error logging out' });
    }
    res.json({ success: true, message: 'You have been successfully logged out.' });
  });
});

// Authentication status endpoint
app.get('/api/auth-status', (req, res) => {
  res.json({
    isAuthenticated: req.session && req.session.isAuthenticated ? true : false
  });
});

app.post('/signup', async (req, res) => {
  try {
    const { name, email, age, gender, password } = req.body;
    
    if (!name || !email || !age || !gender || !password) {
      return res.status(400).send('All fields are required');
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).send('Email already registered');
    }
    
    const newUser = new User({ name, email, age, gender, password });
    await newUser.save();
    res.status(201).send('Registration successful!');
  } catch (err) {
    console.error('Error during registration:', err);
    res.status(500).send('Error registering user');
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unsuccessful login: User not found' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Unsuccessful login: Invalid credentials' });
    }
    
    // Store user info in session
    req.session.user = {
      id: user._id,
      email: user.email,
      name: user.name
    };
    req.session.isAuthenticated = true;
    
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ success: false, message: 'Error during login' });
      }
      res.json({ success: true, message: 'Login successful!' });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Error logging in' });
  }
});

app.get('/api/user-profile', requireLogin, async (req, res) => {
  try {
    const email = req.session.user.email;
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const bmiData = await BMI.findOne({ email: email });
    
    // Return user data without the password
    const userData = {
      name: user.name,
      email: user.email,
      age: user.age,
      gender: user.gender,
      height: user.height,
      weight: user.weight,
      activityLevel: bmiData ? bmiData.activityLevel : null 
    };
    
    res.json(userData);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/update-profile', requireLogin, async (req, res) => {
  try {
      const { email, name, age, gender, height, weight, bmi, activityLevel } = req.body; 

      if (!email) {
          return res.status(400).json({ error: 'Email is required' });
      }

      const user = await User.findOne({ email });

      if (!user) {
          return res.status(404).json({ error: 'User not found' });
      }

      if (name) user.name = name;
      if (age) user.age = age;
      if (gender) user.gender = gender;
      if (height) user.height = height;
      if (weight) user.weight = weight;

      await user.save();

      if (height && weight && bmi) {
          try {
              await BMI.findOneAndUpdate(
                  { email },
                  { userId: user._id, age, gender, height, weight, bmi, activityLevel: activityLevel },
                  { upsert: true }
              );

              // Validatation of activity level
              const activityMultipliers = {
                  'Sedentary': 1.2,
                  'Lightly active': 1.375,
                  'Moderately active': 1.55,
                  'Very active': 1.725,
                  'Extra active': 1.9
              };

              if (!activityMultipliers[activityLevel]) {
                  console.error(`Invalid activity level '${activityLevel}' for user ${email}`);
                  return res.status(400).json({ error: 'Invalid activity level' });
              }

              let bmr;
              if (gender === 'Male') {
                  bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
              } else {
                  bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
              }

              const tdee = bmr * activityMultipliers[activityLevel];

              // Saving calorie data 
              await Calorie.findOneAndUpdate(
                  { userId: user._id },
                  { email, bmr, tdee },
                  { upsert: true }
              );

              console.log('Calorie calculations saved to energy database');
          } catch (bmiError) {
              console.error('Error saving BMI/Calorie data:', bmiError);
          }
      }

      res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Server error' });
  }
});

// Fetching TDEE
app.get('/api/user-tdee', requireLogin, async (req, res) => {
  try {
      const userId = req.session.user.id; 
      const calorieData = await Calorie.findOne({ userId }).sort({ createdAt: -1 }); 

      if (!calorieData) {
          return res.status(404).json({ error: 'No TDEE data found for this user' });
      }

      res.json({ tdee: Math.round(calorieData.tdee) }); 
  } catch (error) {
      console.error('Error fetching TDEE:', error);
      res.status(500).json({ error: 'Server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}/home_page.html`);
});