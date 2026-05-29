import { promises as fs } from 'fs';
import path from 'path';

interface KeeperLogEntry {
  timestamp: string;
  sender: string;
  subject: string;
  owaLink: string;
}

async function getKeeperLogEntries(): Promise<KeeperLogEntry[]> {
  const logFilePath = path.join(process.cwd(), '../workspace/memory/outlook_keeper_log.md');
  try {
    const content = await fs.readFile(logFilePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.startsWith('- '));
    
    const entries: KeeperLogEntry[] = [];
    const regex = /- \*\*Timestamp:\*\* (.*?), \*\*Sender:\*\* (.*?), \*\*Subject:\*\* \"(.*?)\", \*\*Link:\*\* <(.*?)>/;

    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        entries.push({
          timestamp: match[1],
          sender: match[2],
          subject: match[3],
          owaLink: match[4],
        });
      }
    }
    return entries;
  } catch (error) {
    console.error("Error reading or parsing Outlook Keeper log:", error);
    return [];
  }
}

export async function OutlookKeeperLog() {
  const entries = await getKeeperLogEntries();

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm p-4">
      <h2 className="text-xl font-semibold mb-4">Outlook Keeper Log</h2>
      {entries.length === 0 ? (
        <p className="text-zinc-600">No keeper messages logged yet.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto space-y-3">
          {entries.map((entry, index) => (
            <div key={index} className="border-b border-zinc-100 pb-3 last:border-b-0">
              <p className="text-sm text-zinc-500">{entry.timestamp}</p>
              <p className="font-medium text-zinc-800">{entry.subject}</p>
              <p className="text-sm text-zinc-700">From: {entry.sender}</p>
              <a href={entry.owaLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                View in Outlook
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
