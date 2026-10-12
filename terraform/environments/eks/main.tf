module "network" {
  source = "../../modules/network"

  vpc_id      = var.vpc_id
  subnet_a_id = var.subnet_a_id
  subnet_b_id = var.subnet_b_id
}

module "iam" {
  source = "../../modules/iam"

  project_name = "expense-tracker"
}

module "eks" {
  source = "../../modules/eks"

  cluster_name        = var.cluster_name
  cluster_role_arn    = module.iam.cluster_role_arn
  node_role_arn       = module.iam.node_role_arn
  ebs_csi_role_arn    = module.iam.ebs_csi_role_arn
  subnet_ids          = module.network.subnet_ids
  public_access_cidrs = var.eks_api_allowed_cidrs

  depends_on = [module.iam]
}
