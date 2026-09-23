/**
 * Executable check for lib/file-accept.ts (drag-and-drop accept filtering).
 *   node --experimental-strip-types scripts/checks/file-accept.check.mjs
 */
import { isFileAccepted, partitionByAccept } from '../../lib/file-accept.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};
const file = (name, type = '') => ({ name, type });

// no filter / wildcard
check('undefined accept takes anything', isFileAccepted(file('a.exe', 'application/x-msdownload'), undefined));
check('empty accept takes anything', isFileAccepted(file('a.bin'), ''));
check('"*" takes anything', isFileAccepted(file('a.bin', 'application/octet-stream'), '*'));

// extension tokens (case-insensitive)
check('.pdf matches .pdf', isFileAccepted(file('report.pdf', 'application/pdf'), '.pdf'));
check('.pdf matches upper-case .PDF', isFileAccepted(file('SCAN.PDF', 'application/pdf'), '.pdf'));
check('.pdf rejects .docx', !isFileAccepted(file('memo.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), '.pdf'));
check('.pdf rejects unknown-type .xyz (extension decides)', !isFileAccepted(file('notes.xyz', ''), '.pdf'));
check('list with spaces', isFileAccepted(file('photo.JPEG', 'image/jpeg'), '.png, .jpg, .jpeg'));
check('.hwpx with empty browser type', isFileAccepted(file('문서.hwpx', ''), '.pdf,.hwpx'));

// MIME tokens
check('image/* matches image/png', isFileAccepted(file('a.png', 'image/png'), 'image/*'));
check('image/* rejects application/pdf', !isFileAccepted(file('a.pdf', 'application/pdf'), 'image/*'));
check('video/* rejects image/gif', !isFileAccepted(file('a.gif', 'image/gif'), 'video/*'));
check('video/* lets through a type-less .mkv', isFileAccepted(file('movie.mkv', ''), 'video/*'));
check('exact MIME token', isFileAccepted(file('a', 'application/pdf'), 'application/pdf'));

// mixed MIME + extension
check('video/*,.png takes png', isFileAccepted(file('logo.png', 'image/png'), 'video/*,.png,.jpg'));
check('video/*,.png takes mp4', isFileAccepted(file('clip.mp4', 'video/mp4'), 'video/*,.png,.jpg'));
check('video/*,.png rejects pdf', !isFileAccepted(file('a.pdf', 'application/pdf'), 'video/*,.png,.jpg'));

const { accepted, rejected } = partitionByAccept(
  [file('a.pdf', 'application/pdf'), file('b.png', 'image/png'), file('c.PDF', 'application/pdf')],
  '.pdf',
);
check('partition keeps order of accepted', accepted.map((f) => f.name).join() === 'a.pdf,c.PDF');
check('partition reports rejected', rejected.map((f) => f.name).join() === 'b.png');

console.log(`\nfile-accept: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
