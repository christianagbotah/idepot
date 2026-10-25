<?php
	
	if($isExpenses == 2) {

		$this->db->where('name', 'Imprest');
		$this->db->or_where('name', 'Petty Cash');
		$accounts = $this->db->get_where('accounts')->result_array();

	} else {

		$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1))->result_array();
	}


	foreach ($accounts as $acc):?>

      <option value="<?=$acc['account_id']?>"><?=$acc['name']?></option>

      <?php
  endforeach;
	
  if($isExpenses == 2) {
?>

	<script type="text/javascript">
		
		$(function() {
			update_bank_balance('<?=$acc['account_id']?>');
		})
	</script>

<?php
	}
?>
