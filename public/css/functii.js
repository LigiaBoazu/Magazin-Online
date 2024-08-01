$(document).ready(function() {
    $('.nav-item.dropdown').on('mouseenter', function() {
        $(this).find('.dropdown-toggle').dropdown('toggle');
    }).on('mouseleave', function() {
        $(this).find('.dropdown-toggle').dropdown('toggle');
    });

    $('.dropdown-toggle').click(function(e) {
        e.stopPropagation();
        let location = '/vizualizare-cos';
        window.location.href = location;
    });
});
