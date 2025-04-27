// blogData.js
const mongoose = require("mongoose");


const extractText = (nodes) => {
    let text = '';
    if (nodes && Array.isArray(nodes)) {
        nodes.forEach(node => {
            if (node.children) {
                text += extractText(node.children);
            } else if (node.text) {
                text += node.text + ' ';
            }
        });
    }
    return text.trim(); 
};


const BlogSchema = mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    content: {
        type: String,
        required: [true, "Content is required"],
    },
    authorName: {
        type: String,
        trim: true,
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Assuming you have a User model for authors
        required: true,
    },
    publicationDate: {
        type: Date,
        default: Date.now,
    },
    tags: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tag',
    }],
    visibility: {
        type: String,
        enum: ['public', 'private'],
        default: 'public',
    },
    status: {
        type: String,
        enum: ['Published', 'Draft', 'Archived'],
        default: 'Published',
    },
    comments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
    }],
    featuredImage: {
        type: String,
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    wordCount: {
        type: Number,
        default: 0,
    },
    readingTime: {
        type: Number,
        default: 0,
    },
    slug: {
        type: String,
        unique: true,
        required: true,
        index: true,
    }
}, { timestamps: true });

BlogSchema.index({ title: 'text', slug: 'text' });

BlogSchema.pre('save', function(next) {
    if (this.isModified('content')) {
        try {
            const parsedContent = JSON.parse(this.content);
            const contentText = extractText(parsedContent);
            this.wordCount = contentText ? contentText.split(/\s+/).length : 0;
            this.readingTime = Math.ceil(this.wordCount / 200);
        } catch (e) {
            console.error("Failed to parse content for word count calculation:", e);
        }
    }
    next();
});

const Blog = mongoose.model("Blog", BlogSchema);
module.exports = Blog;
