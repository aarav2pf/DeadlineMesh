import { useEffect, useRef, type RefObject } from "react";

type DialogElement = HTMLElement;

/** Keeps keyboard focus inside an open dialog and supports Escape to close it. */
export function useDialogAccessibility(
  isOpen: boolean,
  onClose: () => void,
  dialogRef: RefObject<DialogElement | null>,
) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const activeDialog: HTMLElement = dialog;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusableElements = () =>
      Array.from(activeDialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => {
          const style = window.getComputedStyle(element);
          return (
            !element.closest("[hidden]") &&
            element.getAttribute("aria-hidden") !== "true" &&
            style.display !== "none" &&
            style.visibility !== "hidden"
          );
        },
      );

    const focusInitialElement = () => {
      const preferred = activeDialog.querySelector<HTMLElement>("[autofocus]");
      const firstInput = activeDialog.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
      );
      const firstFocusable = getFocusableElements()[0];
      (preferred ?? firstInput ?? firstFocusable ?? activeDialog).focus();
    };

    focusInitialElement();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !activeDialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !activeDialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, dialogRef]);
}
