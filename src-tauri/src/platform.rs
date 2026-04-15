//! Platform-specific functionality

#[cfg(target_os = "macos")]
mod macos {
    use objc::runtime::Object;
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::CString;
    use std::sync::Mutex;

    /// Opaque handle to an NSProcessInfo activity
    pub struct ActivityToken(*mut Object);

    unsafe impl Send for ActivityToken {}
    unsafe impl Sync for ActivityToken {}

    /// Global storage for the activity token
    static MINING_ACTIVITY: Mutex<Option<ActivityToken>> = Mutex::new(None);

    /// NSActivityUserInitiatedAllowingIdleSystemSleep: prevents App Nap throttling
    /// (keeps mining perf when window is minimized) but allows system sleep on lid close.
    const NS_ACTIVITY_USER_INITIATED_ALLOWING_IDLE_SLEEP: u64 = 0x00FFFFFF;

    /// Begin App Nap prevention for mining
    pub fn begin_mining_activity() {
        let mut guard = MINING_ACTIVITY.lock().unwrap();

        // Already active
        if guard.is_some() {
            return;
        }

        unsafe {
            let process_info: *mut Object = msg_send![class!(NSProcessInfo), processInfo];
            if process_info.is_null() {
                log::warn!("Failed to get NSProcessInfo");
                return;
            }

            let reason_cstr = match CString::new("Mining cryptocurrency") {
                Ok(s) => s,
                Err(_) => return,
            };
            let reason: *mut Object = msg_send![
                class!(NSString),
                stringWithUTF8String: reason_cstr.as_ptr()
            ];

            let options = NS_ACTIVITY_USER_INITIATED_ALLOWING_IDLE_SLEEP;

            let activity: *mut Object = msg_send![
                process_info,
                beginActivityWithOptions: options
                reason: reason
            ];

            if !activity.is_null() {
                *guard = Some(ActivityToken(activity));
                log::info!("macOS App Nap prevention enabled for mining");
            }
        }
    }

    /// End App Nap prevention
    pub fn end_mining_activity() {
        let mut guard = MINING_ACTIVITY.lock().unwrap();

        if let Some(token) = guard.take() {
            unsafe {
                let process_info: *mut Object = msg_send![class!(NSProcessInfo), processInfo];
                if !process_info.is_null() && !token.0.is_null() {
                    let _: () = msg_send![process_info, endActivity: token.0];
                    log::info!("macOS App Nap prevention disabled");
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
pub use macos::{begin_mining_activity, end_mining_activity};

#[cfg(not(target_os = "macos"))]
pub fn begin_mining_activity() {}

#[cfg(not(target_os = "macos"))]
pub fn end_mining_activity() {}
