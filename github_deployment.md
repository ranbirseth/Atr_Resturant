# How to Move Your Project to Another Device using GitHub

This guide covers two main steps:
1.  **Current Device**: Pushing your latest code to GitHub.
2.  **New Device**: Cloning and setting up the project.

---

## Part 1: On Your Current Device (Push Code)

First, ensure all your latest changes (like the Admin Dashboard fixes and README updates) are saved to GitHub.

1.  **Check Status**: See which files have changed.
    ```powershell
    git status
    ```

2.  **Add Changes**: Stage all your changes.
    ```powershell
    git add .
    ```

3.  **Commit Changes**: Save them with a message.
    ```powershell
    git commit -m "Update project with real-time notifications and docs"
    ```

4.  **Connect to GitHub** (If you haven't already):
    *   Create a **New Repository** on GitHub (empty, no README/gitignore).
    *   Run this command (replace `YOUR_LINK` with your actual repo link):
    ```powershell
    git remote add origin https://github.com/YOUR_USERNAME/zink-zaika.git
    git branch -M main
    git push -u origin main
    ```
    *(If you already connected it, just run `git push`)*

---

## Part 2: On Your New Device (Clone & Setup)

1.  **Install Prerequisites**:
    *   Make sure you have [Node.js](https://nodejs.org/) installed.
    *   Make sure you have [Git](https://git-scm.com/) installed.

2.  **Clone the Repository**:
    Open a terminal/command prompt where you want the project folder.
    ```powershell
    git clone https://github.com/YOUR_USERNAME/zink-zaika.git
    cd zink-zaika
    ```

3.  **Install Dependencies (The "Magical" Part)**:
    You need to install libraries for **each** folder separately.

    *   **Server**:
        ```powershell
        cd server
        npm install
        ```
    *   **Admin Dashboard**:
        ```powershell
        cd ../AdminDashbord
        npm install
        ```
    *   **Client App**:
        ```powershell
        cd ../client
        npm install
        ```

4.  **Setup Environment Variables**:
    *   Go to the `server` folder.
    *   Create a new file named `.env`.
    *   Paste your secrets inside (GitHub doesn't save this file for security!):
        ```env
        PORT=5000
        MONGO_URI=your_mongodb_connection_string
        ADMIN_SECRET_CODE=ADMIN2024
        ```

5.  **Run the Project**:
    You will need 3 separate terminals:
    1.  **Server**: `cd server` -> `npm run dev`
    2.  **Admin**: `cd AdminDashbord` -> `npm run dev`
    3.  **Client**: `cd client` -> `npm run dev`
