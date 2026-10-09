module "network" {
  source = "./modules/network"

  vpc_id      = var.vpc_id
  subnet_a_id = var.subnet_id
  subnet_b_id = "subnet-0c244755871c2f8be"
}
