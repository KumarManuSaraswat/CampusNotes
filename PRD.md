# **Product Requirements Document (PRD)** 

# **Community-Driven, AI-Powered Note-Sharing Platform** 

**Version:** 1.0 **Project type:** 12-hour hackathon MVP **Team size:** 4 members **Category:** AI-OPEN | Open Innovation — AI & Machine Learning **Proposed stack:** MERN + AI API 

# **1. Product Overview** 

# **1.1 Product vision** 

Build a community-driven platform where students can upload, discover, request, and download handwritten or digital lecture notes. AI automatically organizes uploaded documents when students do not provide metadata, making notes easier to find. A community reputation system encourages students to contribute useful resources and maintain a trustworthy repository. 

# **1.2 Problem statement** 

Students frequently miss lectures because of illness, personal commitments, or other circumstances. They may struggle to obtain the exact notes for a particular subject, instructor, or lecture date. 

Existing file-sharing approaches often depend on scattered WhatsApp groups, manually shared links, or poorly organized folders. Students may have useful notes but lack an easy way to share them with others who need them. 

# **1.3 Proposed solution** 

Create a centralized note-sharing website with four core capabilities: 

1. **Share:** Upload handwritten notes, scanned documents, or digital PDFs. 

2. **Organize:** Let students add their own tags or use AI to automatically classify notes. 

3. **Discover:** Search and filter notes by subject, topic, instructor, lecture date, and other metadata. 

4. **Appreciate:** Use upvotes, downvotes, reputation points, badges, and reporting to support community participation. 

# **1.4 Target users** 

- College students who miss lectures. 

- Students looking for notes from specific instructors or dates. 

- Students willing to share their own notes. 

- Community moderators responsible for handling reports. 

# **2. Goals and Success Criteria** 

# **Primary goals** 

- Make note uploads straightforward. 

- Support both manual and AI-generated metadata. 

- Demonstrate that AI can organize poorly named or handwritten notes. 

- Make relevant notes discoverable through search and filters. 

- Encourage contributions through community recognition. 

# **MVP success criteria** 

The demo is successful when the team can demonstrate the following end-to-end workflow: 

- A student uploads a PDF or image. 

- The student either adds tags manually or leaves metadata blank. 

- AI generates suggested metadata for an unclassified upload. 

- Another student searches for the notes and finds them. 

- The student opens or downloads the original file. 

- A logged-in student votes on a note. 

- The uploader's reputation or badge status updates according to the defined rules. 

- A user can report an inappropriate or irrelevant upload. 

These are acceptance criteria for the prototype, not claims of production readiness. 

# **3. Functional Requirements** 

# **FR-01: User authentication** 

# **Priority: P0 — Must have** 

Users must be able to register, log in, and log out. 

Required fields: 

- Name 

- Email 

- Password 

Requirements: 

- Store passwords securely using a password-hashing library. 

- Use JWT-based authentication or an equivalent secure session mechanism. 

- Protect authenticated actions such as uploading, voting, and reporting. 

- Display the user's name and contribution profile. 

**MVP simplification:** Skip email verification, password recovery, and social login. 

# **FR-02: Upload notes** 

**Priority: P0 — Must have** 

Users can upload: 

- Digital PDFs 

- Scanned PDFs 

- Images of handwritten notes (JPG, JPEG, PNG) 

Optional metadata: 

- Title 

- Subject 

- Topic tags 

- Instructor name 

- Lecture date 

- Semester or course 

- Short description 

Upload behavior: 

- Students may provide all, some, or none of the optional metadata. 

- The original document must remain available for preview or download. 

- The system validates supported formats and file size. 

- Successful uploads appear in the shared repository. 

**Acceptance criteria:** An authenticated student can upload a supported file with or without tags and see the uploaded note in the application. 

# **FR-03: AI-powered note organization** 

# **Priority: P0 — Must have** 

When AI organization is enabled, the backend processes an uploaded document and generates suggested metadata. 

AI should attempt to identify: 

- Subject 

- Topics and keywords 

- Document type 

- Instructor, if supported by reliable evidence 

- Lecture date, if supported by reliable evidence 

- A concise description 

Processing requirements: 

1. Store the original file. 

2. Extract document text where possible. 

3. Use a vision-capable AI model for scanned or handwritten pages when necessary. 

4. Generate structured metadata. 

5. Preserve user-provided fields and tags. 

6. Add AI suggestions only where appropriate. 

7. Save the resulting metadata for search. 

If AI processing fails, the original upload must remain available, and the system should allow manual metadata entry. 

**Important:** Do not invent missing instructor names or dates. Mark uncertain fields as unknown or leave them empty. 

**MVP simplification:** Use one AI provider and one structured response format. Avoid building a custom ML model. 

# **FR-04: Browse and search notes** 

# **Priority: P0 — Must have** 

The repository must support: 

- Search by title or keywords. 

- Filter by subject and tags. 

- Filter by instructor. 

- Filter by lecture date when available. 

- Browse recent uploads. 

- Sort by newest and highest community score. 

Each note card should show: 

- Title 

- Subject and topic tags 

- Uploader 

- Upload date 

- Available lecture metadata 

- Vote score 

- Download or open action 

**Acceptance criteria:** A student can find an uploaded React or MongoDB note using its title or topic tags. 

# **FR-05: Semantic search** 

**Priority: P1 — Should have if time permits** 

Enable search by meaning instead of exact keywords. 

Example: 

Search: "notes about passing data between React components" 

Relevant result: "React Props — Lecture Notes" 

Implementation: 

- Extract text from the document. 

- Generate an embedding for the document or its text chunks. 

- Generate an embedding for the search query. 

- Retrieve the most relevant documents through vector similarity. 

- Apply metadata filters where appropriate. 

**Fallback:** If vector search cannot be completed reliably within the hackathon, demonstrate AI-generated tags and keyword search. Do not claim semantic search works unless it is implemented. 

# **FR-06: Note requests** 

# **Priority: P1 — Should have** 

Students can request missing notes. 

A request contains: 

- Title or topic 

- Subject 

- Instructor (optional) 

- Lecture date (optional) 

- Description 

Other students can view open requests and respond by uploading relevant notes. 

**MVP simplification:** Build a request list and a basic fulfilled status. Defer notifications and messaging. 

# **FR-07: Voting system** 

# **Priority: P0 — Must have a basic version** 

Users can upvote or downvote notes. 

Rules: 

- A user can have only one active vote per note. 

- Users cannot vote on their own notes. 

- Users can change or remove their vote. 

- The score is calculated as upvotes minus downvotes. 

- Votes must be validated by the backend. 

Use the score to rank notes, but do not automatically delete or hide notes merely because they receive downvotes. 

# **FR-08: Reputation points and badges** 

# **Priority: P1 — Basic version** 

Suggested initial rules: 

|**Event**|**Points**|
|---|---|
|Upload an approved note|+5|
|Receive an upvote|+2|
|Fulfill a note request|+10|
|Receive a confirmed moderation penalty|Review manually|



Example badges: 

- **First Contribution:** First note uploaded. 

- **Community Helper:** Five note requests fulfilled. 

- **Highly Appreciated:** Fifty net upvotes across notes. 

- **Knowledge Champion:** Twenty-five positively received contributions. 

Requirements: 

- Compute points from validated backend events. 

- Prevent users from awarding themselves points. 

- Prevent repeated actions from generating unlimited rewards. 

- Do not award points for simply submitting reports. 

- Display the user's reputation and earned badges on their profile. 

**MVP simplification:** Implement two badges and a simple reputation score first. Add the remaining badges only after core functionality works. 

# **FR-09: Reporting and moderation** 

# **Priority: P1 — Basic version** 

Users can report notes for: 

- Spam 

- Misleading metadata 

- Duplicate uploads 

- Inappropriate content 

- Suspected unauthorized or plagiarized material 

Requirements: 

- Each report includes a category and optional explanation. 

- Reports are stored for moderator review. 

- Duplicate reports from the same user should be prevented or rate-limited. 

- A report must not automatically result in a ban. 

- Moderators can view reports and mark them as reviewed. 

**MVP simplification:** A basic report form and an admin-only report list are sufficient. Do not build a complex moderation dashboard. 

# **FR-10: User profile** 

# **Priority: P1 — Basic version** 

A profile displays: 

- Name 

- Reputation points 

- Earned badges 

- Uploaded notes 

- Contribution count 

Defer profile customization and advanced statistics. 

# **4. Non-Functional Requirements** 

# **Performance** 

- Normal browsing and filtering should feel responsive. 

- Show loading indicators while files or AI requests are processed. 

- AI processing may be asynchronous; users should see a pending or failed status when necessary. 

# **Security** 

- Validate uploaded file types and sizes on the server. 

- Never expose AI API keys in frontend code. 

- Validate permissions for uploads, votes, reports, and moderation. 

- Sanitize user input. 

- Protect against unauthorized file access and malicious uploads. 

# **Reliability** 

- An AI failure must not delete the original uploaded document. 

- Store file metadata and processing status in MongoDB. 

- Show meaningful error messages for failed uploads or processing. 

# **Usability** 

- Responsive interface for laptop and mobile. 

- Clear upload, search, and download workflows. 

- AI-generated metadata should be distinguishable from user-provided metadata. 

- Students should be able to correct inaccurate metadata. 

# **Scope limitation** 

This is a hackathon prototype. Production-grade scaling, extensive security auditing, institutional integrations, and advanced abuse detection are outside the 12-hour scope. 

# **5. Technical Architecture** 

# **Frontend** 

- React 

- Vite 

- React Router 

- Tailwind CSS 

- Fetch or Axios for API calls 

# **Backend** 

- Node.js 

- Express 

- MongoDB 

- Mongoose 

- JWT authentication 

- Password hashing with bcrypt or an equivalent library 

# **AI and file processing** 

- One vision-capable LLM API for metadata extraction. 

- PDF text extraction library for text-based PDFs. 

- Vision processing for handwritten or scanned notes. 

- Optional embedding model and vector search for semantic retrieval. 

# **File storage** 

Use a cloud object-storage service or an equivalent file-storage solution. Store file URLs and metadata in MongoDB, rather than storing large files directly inside document records. 

For the hackathon, choose a storage provider and AI API that can be configured quickly and tested before integration. 

# **Architecture flow** 

Student → React frontend → Express API → MongoDB and file storage 

For AI-enabled uploads: 

Express API → File extraction → AI metadata generation → MongoDB → Searchable note repository 

For voting: 

React frontend → Authenticated vote endpoint → MongoDB → Updated score and reputation 

# **6. Suggested Database Models** 

# **User** 

- _id 

- name 

- email 

- passwordHash 

- reputationPoints 

- badges 

- role — student or moderator 

- createdAt 

# **Note** 

- _id 

- title 

- description 

- fileUrl 

- fileType 

- subject 

- tags[] 

- instructor 

- lectureDate 

- semester 

- uploadedBy 

- aiMetadata 

- extractedText (optional) 

- processingStatus — pending, completed, failed 

- upvoteCount 

- downvoteCount 

- score 

- createdAt 

# **Vote** 

- _id 

- user 

- note 

- value — +1 or -1 

- createdAt 

Create a unique compound index on { user, note } to enforce one vote record per user per note. 

# **NoteRequest** 

- _id 

- createdBy 

- title 

- subject 

- instructor 

- lectureDate 

- description 

- status — open or fulfilled 

- fulfilledBy 

- createdAt 

# **Report** 

- _id 

- reportedBy 

- note 

- reason 

- description 

- status — pending, reviewed, resolved 

- reviewedBy 

- createdAt 

**Implementation note:** Do not let clients directly update reputation points or vote totals. Calculate them from validated backend actions. 

# **7. API Requirements** 

|**Method**|**Endpoint**|**Purpose**|
|---|---|---|
|POST|/api/auth/register|Register a student|
|POST|/api/auth/login|Authenticate a student|
|GET|/api/notes|Browse, search and filter notes|



|GET|/api/notes/:id|Get note details|
|---|---|---|
|POST|/api/notes|Upload a note|
|PATCH|/api/notes/:id|Update note metadata|
|DELETE|/api/notes/:id|Delete own note, subject to authorization|
|POST|/api/notes/:id/vote|Add or change a vote|
|DELETE|/api/notes/:id/vote|Remove a vote|
|POST|/api/notes/:id/report|Report a note|
|POST|/api/requests|Create a note request|
|GET|/api/requests|List note requests|
|PATCH|/api/requests/:id/fulfill    i|i Mark a request fulfilled|
|GET|/api/users/:id/profile|Get a user's public profile|
|GET|/api/admin/reports|List reports for moderators|
|Impleme<br>postpon|nt only the endpoints r<br>ed.|equired for the demo. Additional endpoints can be|



# **8. User Interface Requirements** 

# **Page 1: Home / Discover** 

- Search bar 

- Subject and topic filters 

- Recent uploads 

- Highest-rated notes 

- Upload button 

- Open note requests 

# **Page 2: Upload Notes** 

- File upload area 

- Optional title, tags, instructor, date, and semester 

- AI organization option 

- Processing status 

- Metadata review and correction 

# **Page 3: Note Details** 

- Note title and metadata 

- Preview or download 

- Upvote and downvote controls 

- Uploader information 

- Report action 

# **Page 4: Requests** 

- List open requests 

- Create request form 

- Fulfilled status 

# **Page 5: Profile** 

- Reputation score 

- Badges 

- Uploaded notes 

# **Page 6: Basic moderation** 

- List pending reports 

- View report reason 

- Mark as reviewed 

**Design principle:** Keep the interface simple and polished. Prioritize a functional upload-to-discovery flow over elaborate animations or complex visual effects. 

# **9. Four-Person Team Allocation** 

Assign clear ownership to reduce integration conflicts. 

# **Member 1 — Frontend and design** 

# **Responsibilities** 

- Build the home/discover page. 

- Build note cards, search and filters. 

- Build note details and download interface. 

- Create a consistent responsive design. 

**Deliverables:** A usable frontend connected to the backend APIs. 

# **Member 2 — Backend and authentication** 

# **Responsibilities** 

- Initialize Express and MongoDB. 

- Create the User and Note models. 

- Implement registration, login, and authentication middleware. 

- Implement upload and note CRUD APIs. 

- Configure environment variables and API error handling. 

**Deliverables:** Working authentication and note management endpoints. 

**Member 3 — AI and document processing** 

# **Responsibilities** 

- Integrate file text extraction. 

- Integrate the AI metadata-extraction API. 

- Handle handwritten images and scanned documents where supported. 

- Generate structured metadata. 

- Implement pending, completed, and failed processing states. 

- Assist with semantic search if time permits. 

**Deliverables:** A working AI organization pipeline with a manual fallback. 

# **Member 4 — Community features and integration** 

# **Responsibilities** 

- Implement votes and reputation rules. 

- Implement badges. 

- Implement note requests and reporting. 

- Build the relevant UI components. 

- Coordinate integration and run end-to-end tests. 

**Deliverables:** Working community interactions and a tested demonstration flow. 

**Shared responsibility:** All four members should agree on API contracts, MongoDB schemas, file-upload format, and environment-variable names before parallel implementation begins. 

# **10. Twelve-Hour Execution Schedule** 

# **Time Milestone** 

|Hour 0–1|Finalize requirements, initialize repositories, agree on schemas and API<br>contracts|
|---|---|
|Hour 1–3|Build authentication, upload interface, database models, and frontend<br>layout in parallel|
|Hour 3–5|Complete upload APIs, file storage, AI metadata extraction, and note cards|
|Hour 5–7|Integrate search, filters, votes, and note details|
|Hour 7–9|Add requests, basic badges, reports, and metadata correction|
|Hour 9–10|End-to-end integration and bug fixes|
|Hour 10–<br>11|Deploy and test the primary demo workflow|
|Hour 11–<br>12|Prepare presentation, rehearse demo, and fix only critical issues|



These are target milestones, not guarantees. If integration slips, drop lower-priority features rather than sacrificing the core workflow. 

# **11. Feature Prioritization** 

# **P0 — Required for the demo** 

- Authentication 

- Upload PDFs and images 

- Manual metadata and tags 

- AI-generated metadata 

- Browse and keyword search 

- Download original notes 

- Basic voting 

- Responsive UI 

# **P1 — Add if the core works** 

- Note requests 

- Reputation points 

- Two badges 

- Reporting form 

- Basic moderator report list 

- Semantic search 

# **P2 — Explicitly out of scope** 

- AI chatbot or tutoring 

- AI-generated quizzes and summaries 

- Real-time messaging 

- Push notifications 

- Email verification 

- Advanced leaderboards 

- Complex anti-fraud systems 

- Mobile application 

- Custom-trained ML models 

- Production-grade semantic ranking 

# **12. Risks and Mitigations** 

# **Risk: AI processing takes too long.** 

Mitigation: Show a processing state, use small test documents, and provide manual metadata entry. 

# **Risk: Handwriting is difficult to recognize.** 

Mitigation: Use a vision-capable model for a small number of clear handwritten pages during the demo. Allow the uploader to correct incorrect tags. 

# **Risk: External API or storage setup fails.** 

Mitigation: Test credentials and one complete upload early. Keep a small set of clearly labeled demo documents as a fallback. 

# **Risk: Frontend and backend integration conflicts.** 

Mitigation: Agree on API response formats and request schemas in the first hour. 

# **Risk: Voting is abused.** 

Mitigation: Enforce authentication, one vote per user per note, and server-side validation. 

# **Risk: The team tries to implement everything.** 

Mitigation: Treat P0 features as the completion target. Defer optional functionality when the schedule becomes tight. 

# **13. Final Acceptance Checklist** 

Before the presentation, verify: 

- A student can register and log in. 

- A student can upload a PDF or handwritten image. 

- The uploader can manually select tags. 

- An upload without tags can receive AI-generated metadata. 

- AI suggestions can be corrected. 

- Notes appear in search results. 

- A student can filter notes and download the original. 

- Users can vote without duplicate votes. 

- Reputation and at least one badge work. 

- A student can submit a note request. 

- A student can report a note. 

- The deployed application works with real API credentials. 

- The team has a fallback demonstration if external AI processing fails. 

# **14. Definition of Done** 

The MVP is complete when a judge can use the deployed website to upload a document, observe AI-generated categorization, search for that document as another user, download it, and interact with its community voting controls. 

The product must demonstrate **AI-powered organization of student-contributed notes** , not an AI teaching assistant. All additional features should reinforce the core purpose of sharing, discovering, and appreciating useful notes. 

# **Final product statement:** 

_A community-driven, AI-powered note-sharing platform that transforms studentcontributed handwritten and digital notes into an organized, searchable repository, while encouraging helpful contributions through community recognition._ 

