export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-6 rounded-lg shadow-lg flex flex-col items-center justify-center max-w-prose text-center leading-loose">
        <h1 className="text-2xl font-bold text-black mb-4">
          Vercel AI Integration example in composio
        </h1>
        <div className="text-gray-700">
          To run the example, run{" "}
          <code className="bg-gray-800 text-white p-1 rounded">
            pnpm run dev
          </code>,{" "}
          <br />
          then run a GET request to{" "}
          <code className="bg-gray-800 text-white p-1 rounded">
            http://localhost:3000/api/vercel-demo
          </code>
        </div>
      </div>
    </div>
  );
}
