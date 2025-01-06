# Conversational AI SDK Javascript Example

## Prerequisites

- Node.js >= 18
- pnpm (recommended) or npm

## Environment Variables

Copy the example environment file and fill in the required values:
```bash
cp .env.example .env
```

Required environment variables:
- `XI_API_KEY`: Your ElevenLabs API key (required for voice synthesis)
- `AGENT_ID`: Your Composio Agent ID
- `PORT`: Server port (default: 3000)

## Installation

1. Install dependencies:
```bash
pnpm install  # or npm install
```

## Running the Application

Start the development server:
```bash
pnpm run dev  # or npm run dev
```

This will start:
- Backend server on http://localhost:3000
- Frontend development server on http://localhost:8080

Visit http://localhost:8080 in your browser to use the application.

## Known Issues and Troubleshooting

1. Static File Loading
   - If you encounter 404 errors for CSS/JS files, ensure webpack is configured correctly
   - Check browser console for MIME type errors

2. Agent Connection
   - Ensure both XI_API_KEY and AGENT_ID are properly set in .env
   - Check browser console for connection errors

## Development Notes

- The application uses webpack for frontend bundling
- Hot reloading is enabled for development
- Backend API runs on port 3000
- Frontend development server runs on port 8080
