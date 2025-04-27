const bcrypt = require('bcryptjs');
const User = require('../Models/UserModels');
const Book = require("../Models/BookModels");
const Blog = require("../Models/BlogModels");
const jwt = require('jsonwebtoken');
const asyncHandler = require("express-async-handler"); // Keep if preferred, or use try/catch
// const { constants } = require('fs/promises'); // Unused import

// Register a new user
const registerUser = asyncHandler (async (req, res) => {
    // Add input validation here (e.g., using express-validator)
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        res.status(400);
        throw new Error('Please add all fields');
    }

    const userExists = await User.findOne({ email });

    if (userExists) {
        res.status(400); // Or 409 Conflict
        throw new Error('User already exists');
    }

    // FIX: Remove hardcoded profilePic. Set to null or empty string.
    // Frontend should handle displaying a default avatar if profilePic is null/empty.
    const profilePic = null;

    // Password hashing is handled by the pre-save hook in the model

    const user = await User.create({ // Use create for simplicity
        name,
        email,
        profilePic,
        password,
        // role defaults to 'user' in schema
    });

    if (user) {
        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            profilePic: user.profilePic,
            role: user.role,
            token: generateToken(user._id),
        });
    } else {
        res.status(400); // Or 500 if user creation failed unexpectedly
        throw new Error('Invalid user data');
    }
});

// Login a user
const loginUser = asyncHandler(async (req, res) => {
    // Add input validation
    const { email, password } = req.body;
     if (!email || !password) {
        res.status(400);
        throw new Error('Please provide email and password');
    }

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            profilePic: user.profilePic,
            role: user.role,
            token: generateToken(user._id),
        });
    } else {
        res.status(401); // Unauthorized
        throw new Error('Invalid email or password');
    }
});

//get user info (self)
const getInfo = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const user = await User.findById(userId).select('-password'); 

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Fetch associated content

    const booksUploaded = await Book.find({ uploader: userId })
        .select('title featuredImage publicationDate') // Select relevant fields
        .populate('tags', 'name')
        .sort({ publicationDate: -1 }); // Sort

    const blogsUploaded = await Blog.find({ author: userId })
        .select('title featuredImage publicationDate status visibility slug') // Select relevant fields
        .populate('tags', 'name')
        .sort({ publicationDate: -1 }); // Sort


    // Getting liked content might be less common for a basic 'getInfo' endpoint.
    // Consider separate endpoints if needed, or add pagination/limits.
    const booksLiked = await Book.find({ likes: userId })
        .limit(10) // Example limit
        .select('title featuredImage author') // Select relevant fields
        .sort({ title: 1 });

    const blogsLiked = await Blog.find({ likes: userId })
         .limit(10) // Example limit
         .select('title featuredImage authorName slug') // Select relevant fields
         .sort({ title: 1 });

    res.json({
        user,
        booksUploaded,
        blogsUploaded,
        booksLiked,
        blogsLiked,
    });
});

// Generate JWT token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    });
};

const updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { name, profilePic } = req.body; // Expecting name and profilePic URL

    const user = await User.findById(userId);

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Validate input
    const updates = {};
    if (name && typeof name === 'string' && name.trim() !== '') {
        updates.name = name.trim();
    }
    // Basic URL validation (can be improved)
    if (profilePic && typeof profilePic === 'string' && profilePic.startsWith('http')) {
        updates.profilePic = profilePic;
    } else if (profilePic === null || profilePic === '') { // Allow clearing profile pic
         updates.profilePic = null;
    }


    if (Object.keys(updates).length === 0) {
        res.status(400);
        throw new Error('No valid fields provided for update');
    }

    // Update user document
    const updatedUser = await User.findByIdAndUpdate(userId, updates, {
        new: true, // Return the updated document
        runValidators: true // Run schema validators if any
    }).select('-password'); // Exclude password from response

    res.status(200).json(updatedUser);
});


module.exports = {
    registerUser,
    loginUser,
    getInfo,
    updateProfile,
};