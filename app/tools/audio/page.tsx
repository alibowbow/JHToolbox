import { AudioEditor } from './_components/AudioEditor';

export default function AudioPage() {
  return (
    <div className="-mx-4 -mb-28 -mt-5 sm:-mx-6 lg:-mx-8 lg:-mb-12 lg:-mt-8">
      <AudioEditor mode="editor" />
    </div>
  );
}
