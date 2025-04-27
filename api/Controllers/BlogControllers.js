const Blog = require('../Models/BlogModels');
const Tag = require('../Models/TagModels');
const Comment = require('../Models/CommentModels');
const User = require("../Models/UserModels");
const slugify = require('slugify');
const mongoose = require('mongoose'); // Added for ObjectId validation

// Helper function to safely parse JSON
const safeJsonParse = (jsonString) => {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error parsing JSON:", error);
        return null; // Return null or appropriate default value on error
    }
};

const extractDescription = (contentArray, numOfLines) => {
    let description = '';
    let linesAdded = 0;

    if (!Array.isArray(contentArray)) {
        return description;
    }

    for (const element of contentArray) {
        if (linesAdded >= numOfLines) break;

        const text = element.children ? element.children.map(child => child.text || '').join(' ') : '';

        if (text.trim()) {
            description += (description ? ' ' : '') + text;
            linesAdded++;
        }
    }

    return description;
};

// Extract text from parsed content (handles potential undefined children)
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


// Create a new blog post
const createBlog = async (req, res) => {
    console.log(req.body);
    try {
        const { title, authorName, tags, content, publicationDate, visibility, status, image } = req.body;

        // Safely parse JSON content
        const parsedContent = safeJsonParse(content);
        if (!parsedContent) {
            return res.status(400).json({ error: "Invalid content format" });
        }

        // Safely parse tags
        const parsedTags = safeJsonParse(tags);
        if (!parsedTags || !Array.isArray(parsedTags)) {
             return res.status(400).json({ error: "Invalid tags format" });
        }


        const contentText = extractText(parsedContent);

        // Calculate word count and reading time
        const wordCount = contentText ? contentText.split(/\s+/).length : 0;
        const readingTime = Math.ceil(wordCount / 200);

        // Generate a unique slug
        let slug = slugify(title || '', { lower: true, strict: true }); // Handle potentially undefined title
        if (!slug) { // If title results in empty slug, create a fallback
             slug = `blog-${Date.now()}`;
        }
        let existingBlog = await Blog.findOne({ slug });
        let suffix = 1;
        while (existingBlog) {
            slug = `${slug.split('-').slice(0, -1).join('-') || slug}-${suffix}`; // Prevent multiple suffixes like slug-1-2
            existingBlog = await Blog.findOne({ slug });
            suffix++;
        }

        const newBlog = new Blog({
            title,
            authorName,
            author: req.user._id,
            tags: parsedTags,
            content: JSON.stringify(parsedContent), // Store the stringified valid JSON
            publicationDate,
            visibility,
            status,
            featuredImage: image,
            wordCount,
            readingTime,
            slug
        });

        await newBlog.save();
        res.status(201).json(newBlog);
    } catch (error) {
        console.error('Error creating blog:', error);
        // More specific error handling
        if (error.name === 'ValidationError') {
             res.status(400).json({ error: error.message });
        } else {
             res.status(500).json({ error: "Internal Server Error" });
        }
    }
};

// Get all blog posts
const getAllBlogs = async (req, res) => {
  try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const searchQuery = req.query.search || ''; 

      let userId = null;

      // --- Build Query ---
      let query = {
          visibility: 'public',
          status: 'Published'
      };

      if (searchQuery) {
          query.$text = { $search: searchQuery };
      }

      // --- Execute Queries ---
      const blogsQuery = Blog.find(query)
          .select("title tags likes content readingTime featuredImage publicationDate author slug") // Added slug
          .populate('author', 'name')
          .sort({ publicationDate: -1 }) // Sort by newest first (can be customized)
          .skip(skip)
          .limit(limit);

      const totalBlogsQuery = Blog.countDocuments(query);

      const [blogs, totalBlogs] = await Promise.all([blogsQuery, totalBlogsQuery]);

      // --- Format Response ---
      const formattedBlogs = await Promise.all(
          blogs.map(async (blog) => {
              let contentArray;
              let isLiked = false;

              if (userId && blog.likes.includes(userId)) {
                  isLiked = true;
              }

              contentArray = safeJsonParse(blog.content);
              const description = extractDescription(contentArray, 2);

              const tags = await Tag.find({ _id: { $in: blog.tags } }).select('name');

              return {
                  id: blog._id,
                  title: blog.title,
                  slug: blog.slug,
                  author: blog.author ? { _id: blog.author._id, name: blog.author.name } : { name: blog.authorName || "Unknown" },
                  tags: tags.map(tag => tag.name),
                  likes: blog.likes.length,
                  isLiked: isLiked,
                  readTime: blog.readingTime,
                  featuredImage: blog.featuredImage,
                  description,
                  publicationDate: blog.publicationDate
              };
          })
      );

      const totalPages = Math.ceil(totalBlogs / limit);

      res.status(200).json({
          blogs: formattedBlogs,
          pagination: {
              currentPage: page,
              totalPages,
              totalItems: totalBlogs,
              limit
          }
      });

  } catch (error) {
      console.error("Error fetching blogs:", error);
      // Handle specific errors like invalid search query if needed
      res.status(500).json({ error: "Internal Server Error" });
  }
};


// Get a single blog post by ID
 const getBlogById = async (req, res) => {
    try {
        const blogId = req.params.id;

        // Validate ID format
        if (!mongoose.Types.ObjectId.isValid(blogId)) {
             return res.status(400).json({ error: 'Invalid Blog ID format' });
        }

        let userId = null;
        // FIX: Initialize isLiked here
        let isLiked = false;

        // Optional authentication similar to getAllBlogs
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id).select('_id');
                if (user) {
                    userId = user._id;
                }
            } catch (error) {
                 console.log("Token verification failed or no user found, proceeding without user context.");
            }
        }

        const blog = await Blog.findById(blogId)
            .populate('author', 'name profilePic') // Populate more author details
            .populate('tags', 'name') // Populate tag names directly
            .populate({ // Populate comments with author details
                path: 'comments',
                populate: { path: 'author', select: 'name profilePic' }
             });

        if (!blog) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        // Check visibility (optional: allow authors/admins to see non-public)
        if (blog.visibility !== 'public' && (!userId || !blog.author._id.equals(userId))) {
             // Add admin check here if implementing admin roles
             return res.status(403).json({ error: 'Forbidden: Cannot access this blog post' });
        }


        // FIX: Check like status correctly
        if (userId && blog.likes.includes(userId)){
            isLiked = true;
        }

        // Parse content safely
        const parsedContent = safeJsonParse(blog.content);

        const blogData = {
            _id: blog._id,
            title: blog.title,
            author: blog.author ? {
                _id: blog.author._id,
                name: author.name,
                profilePic: author.profilePic // Include profile pic
            } : { name: blog.authorName || "Unknown" },
            tags: blog.tags, // Already populated with names
            comments: blog.comments, // Already populated with author details
            content: parsedContent, // Return parsed content
            publicationDate: blog.publicationDate,
            lastUpdatedDate: blog.lastUpdatedDate,
            visibility: blog.visibility,
            likes: blog.likes.length,
            isLiked: isLiked, // Correct check
            status: blog.status,
            featuredImage: blog.featuredImage,
            wordCount: blog.wordCount,
            readingTime: blog.readingTime,
            slug: blog.slug
        };

        res.status(200).json(blogData);
    } catch (error) {
        console.error('Error fetching blog:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// get number of blogs likes by ID
const getBloglikes = async (req, res) => {
    try {
      const blogId = req.params.id; // FIX: Use blogId
       // Validate ID format
       if (!mongoose.Types.ObjectId.isValid(blogId)) {
            return res.status(400).json({ error: 'Invalid Blog ID format' });
       }
      const userId = req.user._id; // Assuming protect middleware is used

      // FIX: Query Blog model with blogId
      const blog = await Blog.findById(blogId);

      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }

      const isLiked = blog.likes.includes(userId);
      const likesCount = blog.likes.length;

      return res.status(200).json({ likesCount, isLiked });

    } catch (error) {
      console.error("Error finding number of likes of Blog:", error);
      res.status(500).json({ message: "Server error" });
    }
  };



// like a Blog by ID
const likeBlog = async (req, res) => {
    try {
      const blogId = req.params.id; // Corrected variable name
       // Validate ID format
       if (!mongoose.Types.ObjectId.isValid(blogId)) {
            return res.status(400).json({ error: 'Invalid Blog ID format' });
       }
      const userId = req.user._id; // Assuming protect middleware

      const blog = await Blog.findById(blogId);

      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }

      const likeIndex = blog.likes.indexOf(userId);

      if (likeIndex !== -1) {
        // Unlike
        blog.likes.splice(likeIndex, 1);
        await blog.save();
        // Return updated like count and status
        return res.status(200).json({
            message: "Blog unliked successfully",
            likesCount: blog.likes.length,
            isLiked: false
         });
      } else {
        // Like
        blog.likes.push(userId);
        await blog.save();
         // Return updated like count and status
        return res.status(200).json({
            message: "Blog liked successfully",
            likesCount: blog.likes.length,
            isLiked: true
        });
      }
    } catch (error) {
      console.error("Error liking/unliking blog:", error);
      res.status(500).json({ message: "Server error" });
    }
  };


// Update a blog post by ID
const updateBlog = async (req, res) => {
    try {
        const blogId = req.params.id;
        // Validate ID format
       if (!mongoose.Types.ObjectId.isValid(blogId)) {
            return res.status(400).json({ error: 'Invalid Blog ID format' });
       }

        const blog = await Blog.findById(blogId);

        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }

        // Authorization: Check if the logged-in user is the author
        if (!blog.author.equals(req.user._id)) {
            return res.status(403).json({ message: 'User not authorized to update this blog' });
        }

        // Prepare updates, potentially re-calculating fields if content changes
        const updates = { ...req.body };

        // If content is updated, parse, recalculate word count/reading time
        if (updates.content) {
            const parsedContent = safeJsonParse(updates.content);
            if (!parsedContent) {
                 return res.status(400).json({ error: "Invalid content format" });
            }
            const contentText = extractText(parsedContent);
            updates.wordCount = contentText ? contentText.split(/\s+/).length : 0;
            updates.readingTime = Math.ceil(updates.wordCount / 200);
            updates.content = JSON.stringify(parsedContent); // Store valid stringified JSON
        }

        // If title is updated, regenerate slug (handle collisions)
        if (updates.title && updates.title !== blog.title) {
            let slug = slugify(updates.title, { lower: true, strict: true });
            let existingBlog = await Blog.findOne({ slug, _id: { $ne: blogId } }); // Exclude self
            let suffix = 1;
            while (existingBlog) {
                slug = `${slug.split('-').slice(0, -1).join('-') || slug}-${suffix}`;
                existingBlog = await Blog.findOne({ slug, _id: { $ne: blogId } });
                suffix++;
            }
             updates.slug = slug;
        }

        updates.lastUpdatedDate = Date.now(); // Update the last updated date

        const updatedBlog = await Blog.findByIdAndUpdate(blogId, updates, { new: true })
             .populate('author', 'name profilePic')
             .populate('tags', 'name'); // Populate relevant fields on return

        res.status(200).json(updatedBlog);
    } catch (error) {
        console.error('Error updating blog:', error);
         if (error.name === 'ValidationError') {
             res.status(400).json({ error: error.message });
        } else {
             res.status(500).json({ error: "Internal Server Error" });
        }
    }
};

// Delete a blog post by ID
const deleteBlog = async (req, res) => {
    try {
        const blogId = req.params.id;
         // Validate ID format
       if (!mongoose.Types.ObjectId.isValid(blogId)) {
            return res.status(400).json({ error: 'Invalid Blog ID format' });
       }

        const blog = await Blog.findById(blogId);

        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }

         // Authorization: Check if the logged-in user is the author
        if (!blog.author.equals(req.user._id)) {
             // Add admin check here if needed
            return res.status(403).json({ message: 'User not authorized to delete this blog' });
        }

        await Comment.deleteMany({ blogPost: blogId });

        await Blog.findByIdAndDelete(blogId);

        res.status(200).json({ message: 'Blog deleted successfully' }); // Send confirmation instead of 204
    } catch (error) {
        console.error('Error deleting blog:', error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


module.exports = {
    createBlog,
    getBlogById,
    getAllBlogs,
    deleteBlog,
    updateBlog,
    likeBlog,
    getBloglikes,
}