
<?php
	echo '<option>Select Unit</option>';
	foreach($units_ids as $unit) { 
		echo '<option value="'.$unit['unit_id'].'">'.$unit['unit_name'].'</option>';
	}
?>