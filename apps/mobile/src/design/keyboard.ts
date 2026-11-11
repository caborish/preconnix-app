// Keeps the field being typed in (and the screen's buttons) above the on-screen keyboard.
// Measures how much of this screen the keyboard actually covers, so it works the same under a header, above the
// tab bar, and on Android's edge-to-edge layout, then scrolls the focused field into view.
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, TextInput, type HostInstance, type KeyboardEvent, type ScrollViewInstance } from 'react-native';

const GAP = 24;

export function useKeyboardLift() {
  const root = useRef<HostInstance>(null);
  const scroll = useRef<ScrollViewInstance | null>(null);
  const offset = useRef(0);
  const [lift, setLift] = useState(0);

  useEffect(() => {
    const show = (e: KeyboardEvent) => {
      root.current?.measureInWindow((_x, y, _w, h) => {
        setLift(Math.max(0, y + h - e.endCoordinates.screenY));
        // After the screen has shrunk, bring the focused field into view if it is still hidden.
        setTimeout(() => {
          const input = TextInput.State.currentlyFocusedInput();
          const sv = scroll.current;
          if (!input || !sv) return;
          sv.measureInWindow((_sx, sy, _sw, sh) => {
            input.measureInWindow((_ix, iy, _iw, ih) => {
              const below = iy + ih + GAP - (sy + sh);
              const above = sy + GAP - iy;
              if (below > 0) scroll.current?.scrollTo({ y: offset.current + below, animated: true });
              else if (above > 0) scroll.current?.scrollTo({ y: Math.max(0, offset.current - above), animated: true });
            });
          });
        }, Platform.OS === 'ios' ? 280 : 80);
      });
    };
    const hide = () => setLift(0);
    const subs = Platform.OS === 'ios'
      ? [Keyboard.addListener('keyboardWillShow', show), Keyboard.addListener('keyboardWillHide', hide)]
      : [Keyboard.addListener('keyboardDidShow', show), Keyboard.addListener('keyboardDidHide', hide)];
    return () => subs.forEach(s => s.remove());
  }, []);

  return {
    root,
    scroll,
    lift,
    onScroll: (e: { nativeEvent: { contentOffset: { y: number } } }) => { offset.current = e.nativeEvent.contentOffset.y; }
  };
}
