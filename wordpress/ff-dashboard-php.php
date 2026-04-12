<?php
/**
 * Funders First — Dashboard Config Injector (WPCode PHP Snippet)
 *
 * Injects the ffDashboard JavaScript config object on dashboard pages.
 * This provides the current WP user's ID and role to the JS integration.
 *
 * Add to WPCode as a PHP snippet, set to run on:
 *   - ISO Dashboard page
 *   - Business Owner Dashboard page
 */

add_action('wp_head', function () {
    if (!is_user_logged_in()) return;

    $user = wp_get_current_user();
    $user_id = $user->ID;
    $display_name = $user->display_name;

    // Determine role — map WP roles to FF dashboard roles
    $role = 'business_owner'; // default
    if (in_array('iso_partner', $user->roles) || in_array('iso', $user->roles)) {
        $role = 'iso_partner';
    } elseif (in_array('administrator', $user->roles)) {
        $role = 'admin';
    }

    // Supabase user ID stored in user meta (set during onboarding or first API call)
    $supabase_user_id = get_user_meta($user_id, 'ff_supabase_user_id', true);

    ?>
    <script>
        window.ffDashboard = {
            currentUserId: <?php echo (int) $user_id; ?>,
            currentUserRole: <?php echo json_encode($role); ?>,
            supabaseUserId: <?php echo json_encode($supabase_user_id ?: null); ?>,
            displayName: <?php echo json_encode($display_name); ?>,
        };
    </script>
    <?php
});
