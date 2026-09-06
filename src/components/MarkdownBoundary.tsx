import React from 'react';

interface Props {
  content: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Per-message boundary: if a malformed markdown crashes RichMarkdown, show the
 * raw text instead of dropping the whole bubble (and the app) to the error UI.
 */
export class MarkdownBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('RichMarkdown render error (falling back to raw text):', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div dir="auto" className="whitespace-pre-wrap break-words text-main leading-relaxed">
          {this.props.content}
        </div>
      );
    }
    return this.props.children;
  }
}
